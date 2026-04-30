/**
 * ntfy-subscriber — lytter på samme topic som Skynet publicerer til, og
 * forwarder USER-replies til Claude Code's continue-flow.
 *
 * Hvordan vi adskiller bot-beskeder fra brugerens replies:
 *   - Vores notify() tagger ALLE outgoing med "skynet-bot"
 *   - Subscriberen filtrerer beskeder med det tag fra
 *   - Brugerens manuelle publish via ntfy-app har ikke det tag
 *
 * Reply-flow:
 *   1. Bruger taper notif → ntfy-app åbner besked
 *   2. Bruger swiper / bruger publish-knap → skriver svar → poster til topic
 *   3. ntfy-server emitter event på SSE-stream
 *   4. Subscriber ser event uden "skynet-bot" tag
 *   5. Slår last_finished_session_id op i settings
 *   6. POST /api/claude/continue med {sessionId, cwd, prompt: msg.message}
 *   7. Stop-hook sender ny rig push når Claude Code er færdig
 *
 * Brug ntfy's JSON-stream-endpoint:
 *   GET https://ntfy.sh/<topic>/json
 *   → Newline-delimited JSON, blokerer indtil ny besked
 */

import { getNotifyConfig, getSetting, setSetting } from "@/lib/settings";
import { getControlToken } from "@/lib/control/auth";
import { appendLog } from "@/lib/agent/log-buffer";

const ENABLED_KEY = "ntfy_subscriber_enabled";

interface NtfyEvent {
  id?: string;
  time?: number;
  event?: string;     // "open" | "keepalive" | "message" | "poll_request"
  topic?: string;
  message?: string;
  title?: string;
  tags?: string[];
}

let started = false;
let stopRequested = false;

export function isSubscriberEnabled(): boolean {
  return getSetting(ENABLED_KEY) === "true";
}

export function setSubscriberEnabled(enabled: boolean): void {
  setSetting(ENABLED_KEY, enabled ? "true" : "false");
  if (enabled && !started) startSubscriber();
  if (!enabled) stopRequested = true;
}

export function startSubscriber(): void {
  if (started) return;
  started = true;
  stopRequested = false;
  if (!isSubscriberEnabled()) {
    console.log("[ntfy-subscriber] disabled — sæt ntfy_subscriber_enabled=true for at aktivere");
    return;
  }
  const cfg = getNotifyConfig();
  if (!cfg.ntfyTopic) {
    console.warn("[ntfy-subscriber] mangler ntfy-topic — kan ikke subscribe");
    started = false;
    return;
  }
  console.log(`[ntfy-subscriber] aktiv · topic=${cfg.ntfyTopic}`);
  runLoop().catch((e) => {
    console.error("[ntfy-subscriber] crashed:", e);
    started = false;
  });
}

export function stopSubscriber(): void {
  stopRequested = true;
  started = false;
}

async function runLoop(): Promise<void> {
  let backoffMs = 1000;
  while (!stopRequested && isSubscriberEnabled()) {
    const cfg = getNotifyConfig();
    if (!cfg.ntfyTopic) break;
    try {
      await streamOnce(cfg.ntfyServer.replace(/\/+$/, ""), cfg.ntfyTopic);
      backoffMs = 1000; // reset efter succesfuld stream
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendLog("warn", `ntfy-subscriber stream-fejl: ${msg.slice(0, 120)} · retry om ${backoffMs}ms`, { tool: "ntfy-subscriber" });
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
  }
  started = false;
  console.log("[ntfy-subscriber] stoppet");
}

async function streamOnce(server: string, topic: string): Promise<void> {
  // since=all kan give for mange historiske events — vi vil kun nye
  const url = `${server}/${encodeURIComponent(topic)}/json?since=all&poll=0`;
  // Vi bruger en abort-controller så vi kan break loopet hvis nødvendigt
  const ctrl = new AbortController();
  const checkInterval = setInterval(() => {
    if (stopRequested || !isSubscriberEnabled()) ctrl.abort();
  }, 5000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/x-ndjson" },
    });
    if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
    if (!res.body) throw new Error("ingen response-body");

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        await handleLine(line);
      }
    }
  } finally {
    clearInterval(checkInterval);
  }
}

async function handleLine(line: string): Promise<void> {
  let evt: NtfyEvent;
  try { evt = JSON.parse(line) as NtfyEvent; }
  catch { return; }

  // Skip system-events (open/keepalive osv) — kun "message" er user replies
  if (evt.event !== "message") return;

  const text = (evt.message ?? "").trim();
  if (!text) return;

  // Filtrer botens egne beskeder
  if (evt.tags?.includes("skynet-bot")) return;

  // Find sidste finished session
  const sessionId = getSetting("last_finished_session_id");
  const cwd = getSetting("last_finished_session_cwd");
  if (!sessionId) {
    appendLog("warn", `ntfy-reply uden last_finished_session — droppet: "${text.slice(0, 60)}"`, { tool: "ntfy-subscriber" });
    return;
  }

  appendLog("info", `ntfy-reply → continue session ${sessionId.slice(0, 8)}: "${text.slice(0, 80)}"`, { tool: "ntfy-subscriber" });

  // Kald continue-endpoint
  try {
    const port = process.env.PORT ?? "3100";
    const token = getControlToken();
    const res = await fetch(`http://localhost:${port}/api/claude/continue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId, cwd, prompt: text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      appendLog("error", `continue-endpoint fejlede: HTTP ${res.status} ${err.slice(0, 100)}`, { tool: "ntfy-subscriber" });
    } else {
      appendLog("ok", `Claude Code genstartet via ntfy-reply (${sessionId.slice(0, 8)})`, { tool: "ntfy-subscriber" });
    }
  } catch (e) {
    appendLog("error", `continue-dispatch fejl: ${e instanceof Error ? e.message : "ukendt"}`, { tool: "ntfy-subscriber" });
  }
}
