/**
 * Firewall alerts — sender push når en NY forbindelse har høj risk-score.
 *
 * Strategi:
 *   - Hver 30s: query nye forbindelser (is_new=1) fra sidste 60s
 *   - Inspect hver enkelt (uden LLM — det er for langsomt)
 *   - Hvis risk.score >= threshold OG dedupe-key (process,host) ikke set i 1h:
 *       → sendNotification() med blok-action-button
 *   - Anti-spam: gem (process,host) i in-memory map med TTL
 */

import { listConnections } from "@/lib/firewall/store";
import { inspectConnection } from "@/lib/firewall/inspect";
import { getDb } from "@/lib/db";
import { getSetting, getSkynetPublicUrl } from "@/lib/settings";
import { notify } from "@/lib/notify";

const POLL_MS = 30_000;
const LOOKBACK_MS = 60_000;
const DEFAULT_THRESHOLD = 70;
const DEDUPE_TTL_MS = 60 * 60_000; // 1 time
const STATE_KEY = "__skynet_firewall_alerts_state__";

interface State {
  timer: NodeJS.Timeout | null;
  started: boolean;
  lastTickAt: number | null;
  lastNotifiedAt: number | null;
  /** dedupe-key → ts */
  recent: Map<string, number>;
  alertsSent: number;
}

function getState(): State {
  const g = globalThis as unknown as Record<string, State>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      timer: null,
      started: false,
      lastTickAt: null,
      lastNotifiedAt: null,
      recent: new Map(),
      alertsSent: 0,
    };
  }
  return g[STATE_KEY];
}

function getThreshold(): number {
  const raw = getSetting("firewall_alert_threshold");
  if (!raw) return DEFAULT_THRESHOLD;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : DEFAULT_THRESHOLD;
}

function isEnabled(): boolean {
  return getSetting("firewall_alerts_enabled") === "1";
}

function pruneDedupe(map: Map<string, number>): void {
  const cutoff = Date.now() - DEDUPE_TTL_MS;
  for (const [k, ts] of map) if (ts < cutoff) map.delete(k);
}

async function tick(): Promise<void> {
  const state = getState();
  state.lastTickAt = Date.now();
  pruneDedupe(state.recent);

  try {
    if (!isEnabled()) return;

    const threshold = getThreshold();
    const sinceMs = Date.now() - LOOKBACK_MS;

    // Query nye forbindelser i tidsvinduet
    const db = getDb();
    const news = db
      .prepare(
        `SELECT * FROM network_connections
         WHERE is_new = 1 AND ts >= ? AND raddr IS NOT NULL
         ORDER BY ts DESC LIMIT 50`
      )
      .all(sinceMs) as Array<{
        id: number; pid: number | null; process: string; bundle_id: string | null;
        exec_path: string | null; proto: string; raddr: string | null;
        rport: number | null; rhost: string | null; laddr: string | null;
      }>;

    if (news.length === 0) return;

    for (const c of news) {
      const dedupeKey = `${c.process}::${c.rhost ?? c.raddr}`;
      if (state.recent.has(dedupeKey)) continue;

      try {
        const result = await inspectConnection({
          raddr: c.raddr,
          rhost: c.rhost,
          laddr: c.laddr,
          rport: c.rport,
          proto: c.proto,
          process: c.process,
          bundle_id: c.bundle_id,
          pid: c.pid,
          runLLM: false,
        });

        if (result.risk.score < threshold) {
          // Stadig dedupe (vi vil ikke spam'e med samme low-score igen og igen)
          state.recent.set(dedupeKey, Date.now());
          continue;
        }

        // High-risk! Send notification
        await sendAlert(c, result);
        state.recent.set(dedupeKey, Date.now());
        state.alertsSent++;
        state.lastNotifiedAt = Date.now();
      } catch (e) {
        console.warn("[firewall-alerts] inspect failed:", e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.warn("[firewall-alerts] tick failed:", e instanceof Error ? e.message : e);
  } finally {
    state.timer = setTimeout(() => void tick(), POLL_MS);
  }
}

async function sendAlert(
  conn: { process: string; bundle_id: string | null; exec_path: string | null;
          raddr: string | null; rhost: string | null; rport: number | null; pid: number | null },
  result: Awaited<ReturnType<typeof inspectConnection>>
): Promise<void> {
  const host = conn.rhost ?? conn.raddr ?? "?";
  const country = result.geo?.country_code ?? "??";
  const trackerInfo = result.tracker.isTracker ? ` · tracker (${result.tracker.ownerDisplay})` : "";
  const blocklistInfo = result.blocklist.blocked ? ` · på blocklist` : "";

  const title = `🚨 ${conn.process} → ${host}`;
  const body =
    `Risk ${result.risk.score}/100 (${result.risk.band}) · ${country}${trackerInfo}${blocklistInfo}\n\n` +
    `Top faktor: ${result.risk.factors[0]?.reason ?? "-"}`;

  const publicUrl = getSkynetPublicUrl();

  await notify({
    title,
    body,
    priority: "high",
    tag: "rotating_light",
    url: `http://localhost:3100/firewall`,
    actions:
      publicUrl && conn.bundle_id
        ? [
            {
              type: "http",
              label: "Bloker host",
              url: `${publicUrl}/api/firewall/rules`,
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lulu_key: conn.bundle_id,
                exec_path: conn.exec_path ?? "*",
                process: conn.process,
                action: "block",
                scope: "host",
                remote_host: host,
                description: `Skynet alert-block: ${conn.process} → ${host}`,
              }),
              clear: true,
            },
            {
              type: "view",
              label: "Vis i firewall",
              url: `${publicUrl}/firewall`,
              clear: false,
            },
          ]
        : undefined,
  });
}

export function startFirewallAlerts(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;
  console.log(`[firewall-alerts] starter — poller ${POLL_MS / 1000}s · threshold default ${DEFAULT_THRESHOLD}`);
  void tick();
}

export function stopFirewallAlerts(): void {
  const state = getState();
  state.started = false;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

export function getFirewallAlertsStatus() {
  const state = getState();
  return {
    running: state.started,
    enabled: isEnabled(),
    threshold: getThreshold(),
    lastTickAt: state.lastTickAt,
    lastNotifiedAt: state.lastNotifiedAt,
    alertsSent: state.alertsSent,
    dedupeSize: state.recent.size,
  };
}
