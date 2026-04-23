import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { getAllowlist, type ServiceAllowEntry } from "./allowlist";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const exec = promisify(execCb);

export interface ServiceStatus extends ServiceAllowEntry {
  loaded: boolean;
  running: boolean;
  pid: number | null;
  exitCode: number | null;
  plistPath: string | null;
}

/**
 * Kør launchctl list, parse output, og match mod allowlist.
 * Format: PID  Status  Label  (tab-adskilt, header på linje 1)
 */
async function launchctlList(): Promise<Map<string, { pid: number | null; exit: number | null }>> {
  const map = new Map<string, { pid: number | null; exit: number | null }>();
  try {
    const { stdout } = await exec("/bin/launchctl list", { timeout: 5000 });
    const lines = stdout.split("\n").slice(1); // skip header
    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const [pidRaw, exitRaw, label] = parts;
      const pid = pidRaw === "-" ? null : parseInt(pidRaw, 10);
      const exit = exitRaw === "-" ? null : parseInt(exitRaw, 10);
      map.set(label.trim(), {
        pid: Number.isFinite(pid) ? pid : null,
        exit: Number.isFinite(exit) ? exit : null,
      });
    }
  } catch {
    // ignore — launchctl kan fejle; vi returnerer tomt map
  }
  return map;
}

/** Find plist-sti for en label ved at tjekke standard-locations */
function findPlistPath(label: string): string | null {
  const candidates = [
    join(homedir(), "Library/LaunchAgents", `${label}.plist`),
    `/Library/LaunchAgents/${label}.plist`,
    `/Library/LaunchDaemons/${label}.plist`,
    `/opt/homebrew/Cellar/${label.replace(/^homebrew\.mxcl\./, "")}/HEAD/${label}.plist`,
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export async function listServices(): Promise<ServiceStatus[]> {
  const [allowed, loaded] = await Promise.all([
    Promise.resolve(getAllowlist().services),
    launchctlList(),
  ]);
  return allowed.map((entry) => {
    const row = loaded.get(entry.label);
    return {
      ...entry,
      loaded: row != null,
      running: row?.pid != null,
      pid: row?.pid ?? null,
      exitCode: row?.exit ?? null,
      plistPath: findPlistPath(entry.label),
    };
  });
}

export async function getService(label: string): Promise<ServiceStatus | null> {
  const all = await listServices();
  return all.find((s) => s.label === label) ?? null;
}

export type ServiceAction = "start" | "stop" | "restart" | "status";

export interface ActionResult {
  ok: boolean;
  action: ServiceAction;
  label: string;
  message: string;
  after?: ServiceStatus;
}

async function uidDomain(): Promise<string> {
  const { stdout } = await exec("/usr/bin/id -u", { timeout: 1000 });
  return `gui/${stdout.trim()}`;
}

export async function controlService(
  label: string,
  action: ServiceAction
): Promise<ActionResult> {
  const domain = await uidDomain();
  const target = `${domain}/${label}`;

  try {
    if (action === "status") {
      const after = await getService(label);
      return {
        ok: true,
        action,
        label,
        message: after?.running ? `kører (pid ${after.pid})` : "ikke kørende",
        after: after ?? undefined,
      };
    }

    if (action === "start") {
      const plist = findPlistPath(label);
      if (!plist) {
        return { ok: false, action, label, message: "plist-fil ikke fundet" };
      }
      // bootstrap er idempotent hvis allerede loaded — fald tilbage til kickstart
      try {
        await exec(`/bin/launchctl bootstrap ${domain} "${plist}"`, { timeout: 8000 });
      } catch {
        await exec(`/bin/launchctl kickstart ${target}`, { timeout: 8000 });
      }
    } else if (action === "stop") {
      const plist = findPlistPath(label);
      if (plist) {
        await exec(`/bin/launchctl bootout ${domain} "${plist}"`, { timeout: 8000 });
      } else {
        await exec(`/bin/launchctl bootout ${target}`, { timeout: 8000 });
      }
    } else if (action === "restart") {
      await exec(`/bin/launchctl kickstart -k ${target}`, { timeout: 8000 });
    }

    // Lille wait så state når at opdatere
    await new Promise((r) => setTimeout(r, 700));
    const after = await getService(label);
    return {
      ok: true,
      action,
      label,
      message: `${action} ok`,
      after: after ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ukendt fejl";
    // launchctl fejlkoder → pænere besked
    const hint = /Input\/output error/i.test(msg)
      ? "allerede i denne state"
      : /No such process/i.test(msg)
      ? "service ikke loaded"
      : msg.split("\n")[0].slice(0, 200);
    return { ok: false, action, label, message: hint };
  }
}
