import { exec as execCb } from "child_process";
import { promises as fs } from "fs";
import { promisify } from "util";

const exec = promisify(execCb);

// ── Types ────────────────────────────────────────────────────────────────────

export interface LuluRule {
  /** LuLu's primary key — typically a code-signing identity or "*" for path-based. */
  key: string;
  /** Executable path or "*" wildcard. */
  path: string;
  action: "allow" | "block" | "ask";
  /** Remote address — domain, IP, regex, or "*" (any). */
  addr?: string;
  /** Remote port number, or "*". */
  port?: string;
  /** UUID assigned by LuLu — used for surgical delete. */
  uuid?: string;
  /** True if rule was created by user, false for system/factory rules. */
  enabled?: boolean;
}

export interface LuluStatus {
  /** /Applications/LuLu.app exists. */
  appInstalled: boolean;
  /** lulu-cli is on PATH. */
  cliInstalled: boolean;
  /** lulu-cli --version output, if installed. */
  cliVersion: string | null;
  /** Best-effort: rules.plist file exists (System Extension is set up). */
  rulesPathExists: boolean;
  /** Path to LuLu's rule store. */
  rulesPath: string;
  /** sudo -n lulu-cli --version succeeded → passwordless sudoers is set up. */
  sudoersOk: boolean;
  /** Approximate rule count (parsed from `lulu-cli list`). */
  ruleCount: number | null;
  /** Last-known error string, if any. */
  error: string | null;
}

const RULES_PATH = "/Library/Objective-See/LuLu/rules.plist";
const APP_PATH = "/Applications/LuLu.app";
const LULU_CLI = "/opt/homebrew/bin/lulu-cli";  // primary install path
const LULU_CLI_FALLBACK = "/usr/local/bin/lulu-cli";

let resolvedCliPath: string | null = null;

async function resolveCliPath(): Promise<string | null> {
  if (resolvedCliPath !== null) return resolvedCliPath;
  for (const p of [LULU_CLI, LULU_CLI_FALLBACK]) {
    try {
      await fs.access(p);
      resolvedCliPath = p;
      return p;
    } catch { /* noop */ }
  }
  // Fallback: try `which`
  try {
    const { stdout } = await exec("command -v lulu-cli", { timeout: 1500 });
    const path = stdout.trim();
    if (path) {
      resolvedCliPath = path;
      return path;
    }
  } catch { /* noop */ }
  resolvedCliPath = "";
  return null;
}

// ── Status / detection ──────────────────────────────────────────────────────

export async function detectLulu(): Promise<LuluStatus> {
  const [appOk, rulesOk, cliPath] = await Promise.all([
    fileExists(APP_PATH),
    fileExists(RULES_PATH),
    resolveCliPath(),
  ]);

  let cliVersion: string | null = null;
  let sudoersOk = false;
  let ruleCount: number | null = null;
  let error: string | null = null;

  if (cliPath) {
    // lulu-cli 0.2.0 har ikke --version. I stedet bruger vi `brew list --versions`
    // hvis tilgængelig, ellers parser vi help-outputtet, ellers viser vi bare "installed".
    try {
      const { stdout } = await exec("brew list --versions lulu-cli 2>/dev/null", { timeout: 2000 });
      const m = stdout.trim().match(/lulu-cli\s+(\S+)/);
      if (m) cliVersion = `lulu-cli ${m[1]}`;
    } catch { /* brew not available — try help */ }

    if (!cliVersion) {
      try {
        // CLI uden args printer help; vi bruger det som "exists & runnable" probe.
        await exec(`${shellEscape(cliPath)} 2>&1`, { timeout: 2000 });
        cliVersion = "lulu-cli (installed)";
      } catch (e) {
        error = `lulu-cli probe failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    // Probe sudoers — `sudo -n -l <cli>` viser om NOPASSWD entry findes for binary'en.
    // Falder tilbage til `sudo -n <cli> reload` med kort timeout (vi terminerer hurtigt
    // før reload faktisk når noget destruktivt — exit-code afslører om sudoers var ok).
    try {
      const { stdout } = await exec(`sudo -n -l ${shellEscape(cliPath)} 2>&1`, { timeout: 1500 });
      // Hvis sudoers entry findes, output indeholder fx "/opt/homebrew/bin/lulu-cli"
      if (stdout.includes(cliPath)) sudoersOk = true;
    } catch { /* sudo -n -l fejler hvis sudoers entry ikke er sat op */ }

    // Try to count rules (read-only, no sudo needed) — but only if rules.plist exists
    if (rulesOk) {
      try {
        const rules = await listRules({ silent: true });
        ruleCount = rules.length;
      } catch { /* ignore — first install often has empty/non-readable rules */ }
    }
  }

  return {
    appInstalled: appOk,
    cliInstalled: !!cliPath,
    cliVersion,
    rulesPathExists: rulesOk,
    rulesPath: RULES_PATH,
    sudoersOk,
    ruleCount,
    error,
  };
}

// ── Rule operations (lulu-cli wrapper) ──────────────────────────────────────

interface ListOpts {
  filter?: string;
  silent?: boolean;
}

export async function listRules(opts: ListOpts = {}): Promise<LuluRule[]> {
  const cli = await resolveCliPath();
  if (!cli) throw new Error("lulu-cli not installed");
  const filter = opts.filter ? ` ${shellEscape(opts.filter)}` : "";
  const { stdout } = await exec(`${shellEscape(cli)} list${filter}`, {
    timeout: 8000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseLuluList(stdout);
}

/**
 * lulu-cli list output (text format — not JSON, even though we wish it were):
 *
 *   == Skynet Daemon ==
 *   key=com.parthee.skynet.daemon  path=/Applications/Skynet.app/Contents/...
 *     [allow] addr=*               port=*    uuid=11111111-...
 *     [block] addr=tracker.spotify.com  port=443  uuid=22222222-...
 *
 *   == Spotify ==
 *   ...
 *
 * The header line ("== Name ==") is informational. We accumulate rules under
 * the most-recent (key, path) pair.
 *
 * Supports a fallback simpler format some lulu-cli versions emit:
 *   key=KEY path=PATH action=allow addr=* port=* uuid=...
 */
export function parseLuluList(stdout: string): LuluRule[] {
  const rules: LuluRule[] = [];
  let currentKey = "";
  let currentPath = "";

  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("==") || line.startsWith("#")) continue;

    // Pattern A: header-with-rules format
    // "key=foo path=/bar"
    const hdr = line.match(/^key=(\S+)\s+path=(.+?)(?:\s+(?:action=|\[))?$/);
    if (hdr && !line.includes("[")) {
      currentKey = hdr[1];
      currentPath = hdr[2].trim();
      continue;
    }

    // Pattern B: child-rule line "[allow] addr=X port=Y uuid=Z"
    const child = line.match(/^\[(allow|block|ask)\]\s+addr=(\S+)\s+port=(\S+)(?:\s+uuid=([0-9a-fA-F-]+))?/);
    if (child && currentKey) {
      rules.push({
        key: currentKey,
        path: currentPath || "*",
        action: child[1] as "allow" | "block" | "ask",
        addr: child[2],
        port: child[3],
        uuid: child[4],
        enabled: true,
      });
      continue;
    }

    // Pattern C: full-flat line "key=K path=P action=A addr=X port=Y uuid=U"
    const flat = parseKVLine(line);
    if (flat.key && flat.action) {
      rules.push({
        key: flat.key,
        path: flat.path ?? "*",
        action: flat.action as "allow" | "block" | "ask",
        addr: flat.addr ?? "*",
        port: flat.port ?? "*",
        uuid: flat.uuid,
        enabled: flat.enabled !== "false",
      });
    }
  }

  return rules;
}

function parseKVLine(line: string): Record<string, string> {
  // Naive key=value tokenizer that respects quotes around values containing spaces.
  const out: Record<string, string> = {};
  const re = /(\w+)=("([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out[m[1]] = m[3] ?? m[4];
  }
  return out;
}

export interface AddRuleArgs {
  key: string;
  path: string;
  action: "allow" | "block";
  addr?: string;
  port?: string;
  /** Treat addr as regex. */
  regex?: boolean;
}

export async function addRule(args: AddRuleArgs): Promise<void> {
  const cli = await resolveCliPath();
  if (!cli) throw new Error("lulu-cli not installed");
  const cmd = [
    "sudo", "-n", shellEscape(cli), "add",
    "--key", shellEscape(args.key),
    "--path", shellEscape(args.path),
    "--action", args.action,
  ];
  if (args.addr) cmd.push("--addr", shellEscape(args.addr));
  if (args.port) cmd.push("--port", shellEscape(args.port));
  if (args.regex) cmd.push("--regex");
  await exec(cmd.join(" "), { timeout: 5000 });
}

export async function deleteRule(key: string, uuid?: string): Promise<void> {
  const cli = await resolveCliPath();
  if (!cli) throw new Error("lulu-cli not installed");
  const cmd = ["sudo", "-n", shellEscape(cli), "delete", "--key", shellEscape(key)];
  if (uuid) cmd.push("--uuid", shellEscape(uuid));
  await exec(cmd.join(" "), { timeout: 5000 });
}

export async function reloadLulu(): Promise<void> {
  const cli = await resolveCliPath();
  if (!cli) throw new Error("lulu-cli not installed");
  await exec(`sudo -n ${shellEscape(cli)} reload`, { timeout: 8000 });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Single-quote shell escape — safe for any user-supplied string. */
function shellEscape(s: string): string {
  if (/^[A-Za-z0-9._\-/=*]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'"'"'`)}'`;
}
