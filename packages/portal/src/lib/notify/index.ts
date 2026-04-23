/**
 * Notification-layer — sender beskeder til alle konfigurerede backends.
 *
 * Backends:
 *   - macOS Notification Center  (osascript, lokalt)
 *   - ntfy.sh                    (push til iPhone/Android via ntfy-app)
 *   - Pushover                   (paid, robust push)
 *
 * Kaldes fra scheduler-jobs, threshold-checks, briefings m.v.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { getNotifyConfig, type NotifyConfig } from "../settings";

const execAsync = promisify(exec);

export interface NotifyMessage {
  title: string;
  body: string;
  /** Prioritet: low | default | high — mappes til ntfy/Pushover */
  priority?: "low" | "default" | "high";
  /** Link til at åbne ved klik (kun ntfy/Pushover) */
  url?: string;
  /** Tag/emoji (kun ntfy) — fx "warning", "rotating_light" */
  tag?: string;
}

export interface NotifyResult {
  backend: "macos" | "ntfy" | "pushover";
  ok: boolean;
  error?: string;
}

/**
 * Send en notifikation til alle aktiverede backends parallelt. Returnerer
 * resultat-liste — aldrig throw.
 */
export async function notify(msg: NotifyMessage): Promise<NotifyResult[]> {
  const cfg = getNotifyConfig();
  const jobs: Promise<NotifyResult>[] = [];

  if (cfg.macos) jobs.push(sendMacOS(msg));
  if (cfg.ntfyTopic) jobs.push(sendNtfy(msg, cfg));
  if (cfg.pushoverUser && cfg.pushoverToken) jobs.push(sendPushover(msg, cfg));

  return Promise.all(jobs);
}

/** Send kun til macOS Notification Center */
export async function notifyMacOSOnly(msg: NotifyMessage): Promise<NotifyResult> {
  return sendMacOS(msg);
}

async function sendMacOS(msg: NotifyMessage): Promise<NotifyResult> {
  try {
    const title = escapeAS(msg.title);
    const body = escapeAS(msg.body);
    const sound = msg.priority === "high" ? ' sound name "Submarine"' : "";
    const script = `display notification "${body}" with title "${title}"${sound}`;
    await execAsync(`osascript -e '${script.replace(/'/g, "\\'")}'`, {
      timeout: 5000,
    });
    return { backend: "macos", ok: true };
  } catch (e) {
    return {
      backend: "macos",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function sendNtfy(msg: NotifyMessage, cfg: NotifyConfig): Promise<NotifyResult> {
  try {
    const base = cfg.ntfyServer.replace(/\/+$/, "");
    const url = `${base}/${encodeURIComponent(cfg.ntfyTopic)}`;
    const headers: Record<string, string> = {
      Title: msg.title,
      Priority: mapPriorityNtfy(msg.priority),
    };
    if (msg.tag) headers.Tags = msg.tag;
    if (msg.url) headers.Click = msg.url;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: msg.body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        backend: "ntfy",
        ok: false,
        error: `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`,
      };
    }
    return { backend: "ntfy", ok: true };
  } catch (e) {
    return {
      backend: "ntfy",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function sendPushover(msg: NotifyMessage, cfg: NotifyConfig): Promise<NotifyResult> {
  try {
    const body = new URLSearchParams({
      token: cfg.pushoverToken,
      user: cfg.pushoverUser,
      title: msg.title,
      message: msg.body,
      priority: String(mapPriorityPushover(msg.priority)),
    });
    if (msg.url) body.set("url", msg.url);

    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        backend: "pushover",
        ok: false,
        error: `HTTP ${res.status}`,
      };
    }
    return { backend: "pushover", ok: true };
  } catch (e) {
    return {
      backend: "pushover",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function mapPriorityNtfy(p: NotifyMessage["priority"]): string {
  switch (p) {
    case "low":
      return "low";
    case "high":
      return "high";
    default:
      return "default";
  }
}

function mapPriorityPushover(p: NotifyMessage["priority"]): number {
  switch (p) {
    case "low":
      return -1;
    case "high":
      return 1;
    default:
      return 0;
  }
}

function escapeAS(s: string): string {
  // AppleScript escape: kun backslash og double-quote
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
