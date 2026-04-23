import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { getAllowlist, type AppAllowEntry } from "./allowlist";

const exec = promisify(execCb);

export interface AppStatus extends AppAllowEntry {
  running: boolean;
}

/**
 * Liste over kørende app-navne via AppleScript. Returnerer et Set<string>.
 * Inkluderer BÅDE foreground- og menu-bar-apps (fx LM Studio).
 * Bruges til at markere hvilke allowed apps der pt kører.
 */
async function listRunningAppNames(): Promise<Set<string>> {
  try {
    const { stdout } = await exec(
      `/usr/bin/osascript -e 'tell application "System Events" to get the name of every application process'`,
      { timeout: 4000 }
    );
    const names = stdout
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return new Set(names);
  } catch {
    return new Set();
  }
}

export async function listApps(): Promise<AppStatus[]> {
  const allowed = getAllowlist().apps;
  const running = await listRunningAppNames();
  return allowed.map((entry) => ({ ...entry, running: running.has(entry.name) }));
}

export type AppAction = "launch" | "quit" | "focus";

export interface AppActionResult {
  ok: boolean;
  action: AppAction;
  name: string;
  message: string;
  running?: boolean;
}

/** Escape apostroffer til AppleScript string literal */
function escapeAS(s: string): string {
  return s.replace(/"/g, '\\"');
}

export async function controlApp(
  name: string,
  action: AppAction
): Promise<AppActionResult> {
  try {
    if (action === "launch" || action === "focus") {
      // `open -a` sikrer både launch og focus
      await exec(`/usr/bin/open -a "${escapeAS(name)}"`, { timeout: 6000 });
    } else if (action === "quit") {
      await exec(
        `/usr/bin/osascript -e 'tell application "${escapeAS(name)}" to quit'`,
        { timeout: 6000 }
      );
    }

    // Lille delay + status
    await new Promise((r) => setTimeout(r, 500));
    const running = await listRunningAppNames();
    return {
      ok: true,
      action,
      name,
      message: `${action} ok`,
      running: running.has(name),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : "ukendt fejl";
    return { ok: false, action, name, message: msg };
  }
}
