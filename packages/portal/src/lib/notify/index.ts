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
import { getNotifyConfig, getSkynetPublicUrl, type NotifyConfig } from "../settings";

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
  /** Op til 3 ntfy action-buttons (view/http/broadcast) */
  actions?: NtfyAction[];
}

export type NtfyAction =
  | { type: "view"; label: string; url: string; clear?: boolean }
  | { type: "http"; label: string; url: string; method?: string; headers?: Record<string, string>; body?: string; clear?: boolean }
  | { type: "broadcast"; label: string; intent?: string; extras?: Record<string, string> };

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
    // JSON publishing-form håndterer non-ASCII (emoji, æøå, →) naturligt og
    // har struktureret support for actions. Doc:
    // https://docs.ntfy.sh/publish/#publish-as-json
    const payload: Record<string, unknown> = {
      topic: cfg.ntfyTopic,
      title: msg.title,
      message: msg.body,
      priority: mapPriorityNtfyJson(msg.priority),
    };
    // Tilføj 'skynet-bot' til alle outgoing — bruges af subscriber til at
    // filtrere botens egne beskeder fra brugerens manuelle replies.
    const tags = msg.tag ? ["skynet-bot", msg.tag] : ["skynet-bot"];
    payload.tags = tags;
    if (msg.url) {
      const click = absoluteUrlFor(msg.url);
      if (click) payload.click = click;
    }
    if (msg.actions && msg.actions.length > 0) {
      const acts = msg.actions
        .slice(0, 3)
        .map((a) => actionToJson(a))
        .filter((a): a is Record<string, unknown> => a !== null);
      if (acts.length > 0) payload.actions = acts;
    }

    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

function actionToJson(a: NtfyAction): Record<string, unknown> | null {
  if (a.type === "view") {
    const url = absoluteUrlFor(a.url);
    if (!url) return null; // skip view-action hvis vi ikke har public URL
    return { action: "view", label: a.label, url, clear: a.clear };
  }
  if (a.type === "http") {
    const url = absoluteUrlFor(a.url);
    if (!url) return null;
    return {
      action: "http",
      label: a.label,
      url,
      method: a.method,
      headers: a.headers,
      body: a.body,
      clear: a.clear,
    };
  }
  return { action: "broadcast", label: a.label, intent: a.intent, extras: a.extras };
}

function mapPriorityNtfyJson(p: NotifyMessage["priority"]): number {
  // ntfy JSON priority: 1 (min) — 5 (max). default = 3
  switch (p) {
    case "low": return 2;
    case "high": return 4;
    default: return 3;
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

/**
 * ntfy Click + Action-URLs skal være absolutte (iPhone-app kan ikke åbne
 * relative paths). Vi prøver i rækkefølge: settings.skynet_public_url →
 * env-var SKYNET_PUBLIC_URL → null.
 *
 * Hvis vi ikke har en gyldig public URL: returnér null så caller ved at
 * de skal udelade click/action-URL helt. Det får ntfy-appen på iPhone til
 * at åbne sin egen besked-visning ved tap (i stedet for at sende brugeren
 * til en localhost-URL der ikke virker).
 */
function publicBase(): string | null {
  const fromSettings = getSkynetPublicUrl();
  if (fromSettings) return fromSettings.replace(/\/+$/, "");
  const fromEnv = process.env.SKYNET_PUBLIC_URL?.replace(/\/+$/, "");
  if (fromEnv && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(fromEnv)) return fromEnv;
  return null;
}

function absoluteUrlFor(input: string): string | null {
  if (/^https?:\/\//i.test(input)) return input;
  const base = publicBase();
  if (!base) return null;
  if (input.startsWith("/")) return `${base}${input}`;
  return `${base}/${input}`;
}

