import { exec as execCb } from "child_process";
import { promisify } from "util";
import { getDb } from "@/lib/db";
import { runAgent } from "@/lib/agent/langchain-runner";
import { addRule, deleteRule, reloadLulu, detectLulu } from "./lulu";
import { insertEvent, listConnections, getGeoMany } from "./store";

const exec = promisify(execCb);

// ── Types ────────────────────────────────────────────────────────────────────

export interface NetProfileRow {
  id: number;
  name: string;
  description: string | null;
  ssid_pattern: string | null;
  trust_level: string;
  llm_summary: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface ProfileRule {
  id: number;
  lulu_key: string;
  exec_path: string | null;
  action: string;
  scope: string;
  remote_host: string | null;
  remote_port: number | null;
}

// ── DB helpers ───────────────────────────────────────────────────────────────

export function listProfiles(): NetProfileRow[] {
  return getDb().prepare("SELECT * FROM network_profiles ORDER BY name ASC").all() as NetProfileRow[];
}

export function getProfile(id: number): NetProfileRow | undefined {
  return getDb().prepare("SELECT * FROM network_profiles WHERE id = ?").get(id) as NetProfileRow | undefined;
}

export function getActiveProfile(): NetProfileRow | undefined {
  return getDb()
    .prepare("SELECT * FROM network_profiles WHERE is_active = 1 LIMIT 1")
    .get() as NetProfileRow | undefined;
}

export interface ProfileUpsert {
  name: string;
  description?: string | null;
  ssid_pattern?: string | null;
  trust_level?: "high" | "normal" | "low";
  llm_summary?: string | null;
}

export function createProfile(p: ProfileUpsert): number {
  const db = getDb();
  const info = db
    .prepare(
      `
      INSERT INTO network_profiles (name, description, ssid_pattern, trust_level, llm_summary)
      VALUES (?, ?, ?, ?, ?)
      `
    )
    .run(p.name, p.description ?? null, p.ssid_pattern ?? null, p.trust_level ?? "normal", p.llm_summary ?? null);
  return info.lastInsertRowid as number;
}

export function updateProfile(id: number, patch: Partial<ProfileUpsert>): void {
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === "name" || k === "description" || k === "ssid_pattern" ||
        k === "trust_level" || k === "llm_summary") {
      fields.push(`${k} = ?`);
      params.push(v === undefined ? null : (v as string | number | null));
    }
  }
  if (fields.length === 0) return;
  fields.push("updated_at = ?");
  params.push(Date.now());
  params.push(id);
  getDb()
    .prepare(`UPDATE network_profiles SET ${fields.join(", ")} WHERE id = ?`)
    .run(...params);
}

export function deleteProfile(id: number): void {
  // Profile-bound rules cascade via ON DELETE SET NULL on FK; we let LuLu keep them
  // (they'll appear as global rules in Skynet's mirror after next sync).
  getDb().prepare("UPDATE network_rules SET profile_id = NULL WHERE profile_id = ?").run(id);
  getDb().prepare("DELETE FROM network_profiles WHERE id = ?").run(id);
}

function getProfileRules(profileId: number): ProfileRule[] {
  return getDb()
    .prepare(
      `SELECT id, lulu_key, exec_path, action, scope, remote_host, remote_port
       FROM network_rules WHERE profile_id = ?`
    )
    .all(profileId) as ProfileRule[];
}

// ── SSID detection ───────────────────────────────────────────────────────────

/**
 * Read current Wi-Fi SSID using `networksetup -getairportnetwork`.
 * Works without Location Authorization (modsat CoreWLAN på macOS 14+).
 */
export async function currentSsid(): Promise<string | null> {
  // Try common Wi-Fi interface names — most M-series Macs have en0, but
  // adapter ordering can put Wi-Fi on en1 if Thunderbolt-Ethernet is plugged in.
  for (const iface of ["en0", "en1"]) {
    try {
      const { stdout } = await exec(`/usr/sbin/networksetup -getairportnetwork ${iface}`, {
        timeout: 1500,
      });
      const m = stdout.match(/Current Wi-Fi Network:\s*(.+)/);
      if (m) {
        const ssid = m[1].trim();
        if (ssid && !/disabled|off|Other|none/i.test(ssid)) return ssid;
      }
    } catch { /* iface doesn't exist or no Wi-Fi — try next */ }
  }
  return null;
}

/** Match an SSID against a profile's pattern (glob: `*` wildcard, exact otherwise). */
export function ssidMatches(ssid: string, pattern: string | null): boolean {
  if (!pattern) return false;
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return ssid === pattern;
  // Convert glob to regex (only `*` is special; escape everything else)
  const re = new RegExp(
    "^" +
      pattern
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$"
  );
  return re.test(ssid);
}

export function findProfileForSsid(ssid: string): NetProfileRow | undefined {
  const profiles = listProfiles();
  return profiles.find((p) => ssidMatches(ssid, p.ssid_pattern));
}

// ── Activation: rule-diff via lulu-cli ───────────────────────────────────────

interface ActivateOpts {
  reason?: string;
  ssid?: string | null;
}

export interface ActivateResult {
  ok: boolean;
  profileId: number;
  profileName: string;
  rulesAdded: number;
  rulesRemoved: number;
  warnings: string[];
}

export async function activateProfile(id: number, opts: ActivateOpts = {}): Promise<ActivateResult> {
  const next = getProfile(id);
  if (!next) throw new Error(`profil ${id} findes ikke`);
  const prev = getActiveProfile();

  const status = await detectLulu();
  const warnings: string[] = [];
  if (!status.cliInstalled) warnings.push("lulu-cli ikke installeret — kører i monitor-mode");
  if (status.cliInstalled && !status.sudoersOk) warnings.push("Passwordless sudo mangler — kør install-lulu-sudoers.sh");

  const prevRules = prev ? getProfileRules(prev.id) : [];
  const nextRules = getProfileRules(next.id);

  const sameKey = (a: ProfileRule, b: ProfileRule) =>
    a.lulu_key === b.lulu_key &&
    a.action === b.action &&
    a.scope === b.scope &&
    a.remote_host === b.remote_host &&
    a.remote_port === b.remote_port;

  const toAdd = nextRules.filter((r) => !prevRules.some((p) => sameKey(r, p)));
  const toRemove = prevRules.filter((r) => !nextRules.some((p) => sameKey(r, p)));

  let added = 0;
  let removed = 0;

  if (status.cliInstalled && status.sudoersOk) {
    for (const r of toRemove) {
      try {
        await deleteRule(r.lulu_key);
        removed++;
      } catch (e) {
        warnings.push(`fjern '${r.lulu_key}': ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    for (const r of toAdd) {
      try {
        await addRule({
          key: r.lulu_key,
          path: r.exec_path ?? "*",
          action: r.action === "block" ? "block" : "allow",
          addr: r.scope === "all" ? "*" : r.remote_host ?? "*",
          port: r.scope === "host:port" && r.remote_port ? String(r.remote_port) : "*",
        });
        added++;
      } catch (e) {
        warnings.push(`tilføj '${r.lulu_key}': ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (added + removed > 0) {
      try {
        await reloadLulu();
      } catch (e) {
        warnings.push(`reload: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // DB-state: deactivate old, activate new
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE network_profiles SET is_active = 0").run();
    db.prepare("UPDATE network_profiles SET is_active = 1, updated_at = ? WHERE id = ?").run(Date.now(), next.id);
  })();

  insertEvent({
    kind: "profile_switch",
    detail: {
      from: prev ? { id: prev.id, name: prev.name } : null,
      to: { id: next.id, name: next.name, trust_level: next.trust_level },
      ssid: opts.ssid ?? null,
      reason: opts.reason ?? "manual",
      rules_added: added,
      rules_removed: removed,
    },
    llm_explanation: next.llm_summary,
  });

  return {
    ok: true,
    profileId: next.id,
    profileName: next.name,
    rulesAdded: added,
    rulesRemoved: removed,
    warnings,
  };
}

// ── LLM-suggested profile ────────────────────────────────────────────────────

const SUGGEST_SYSTEM_PROMPT = `Du er en privatlivs-orienteret network-firewall-assistent.

Brugeren er kommet på et nyt Wi-Fi-netværk, og du skal foreslå en profil.

Du får:
- SSID
- Sidste 24h connection-historik (proces, host, country) fra brugerens Mac

Foreslå en profil med:
- name: kort navn (fx "Café", "Lufthavn", "Hjemme-VPN")
- trust_level: "high" (kendte sikre netværk), "normal" (kontor/hjemme), "low" (offentlig hotspot)
- description: 1 sætning på dansk
- recommended_action: "monitor" (bare observér), "block_telemetry" (blokér tracker-apps), "isolate" (kun whitelist'ede apps)

Svar SKAL være valid JSON i præcis dette format:
{
  "name": "string",
  "trust_level": "high|normal|low",
  "description": "string",
  "recommended_action": "monitor|block_telemetry|isolate"
}`;

export async function suggestProfile(ssid: string): Promise<{
  ssid: string;
  name: string;
  trust_level: string;
  description: string;
  recommended_action: string;
  observed_processes: number;
  observed_countries: string[];
}> {
  // Gather 24h context for the prompt
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const conns = listConnections({ sinceMs: since, limit: 500, dedup: true });
  const ips = Array.from(new Set(conns.map((c) => c.raddr).filter((x): x is string => !!x)));
  const geo = getGeoMany(ips);

  const procSet = new Set(conns.map((c) => c.process));
  const countrySet = new Set(
    conns
      .map((c) => (c.raddr ? geo.get(c.raddr)?.country_code : null))
      .filter((x): x is string => !!x)
  );

  const summary = `SSID: ${ssid}
Antal unikke processer sidste 24h: ${procSet.size}
Antal unikke lande: ${countrySet.size}
Top 10 processer: ${[...procSet].slice(0, 10).join(", ")}
Lande set: ${[...countrySet].join(", ") || "(ingen)"}`;

  let parsed: { name?: string; trust_level?: string; description?: string; recommended_action?: string } = {};
  try {
    const out = await runAgent({
      userMessage: summary,
      systemPrompt: SUGGEST_SYSTEM_PROMPT,
      maxTurns: 2,
      forceFirstTool: false,
      logTag: "firewall-suggest-profile",
      timeoutMs: 30_000,
    });
    const stripped = out.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(stripped);
  } catch {
    // Fallback when LLM is unavailable: heuristic
    parsed = {
      name: ssid.length > 20 ? ssid.slice(0, 20) : ssid,
      trust_level: countrySet.size > 5 ? "low" : "normal",
      description: `Auto-foreslået baseret på ${procSet.size} processer / ${countrySet.size} lande`,
      recommended_action: countrySet.size > 5 ? "block_telemetry" : "monitor",
    };
  }

  return {
    ssid,
    name: parsed.name ?? ssid,
    trust_level: parsed.trust_level ?? "normal",
    description: parsed.description ?? "",
    recommended_action: parsed.recommended_action ?? "monitor",
    observed_processes: procSet.size,
    observed_countries: [...countrySet],
  };
}
