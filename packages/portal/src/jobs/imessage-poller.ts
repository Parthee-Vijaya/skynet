/**
 * iMessage-poller — læser nye INKOMMENDE iMessages fra macOS chat.db og
 * forwarder dem til /api/imessage/inbound så LLM kan svare.
 *
 * KRÆVER:
 *   - Full Disk Access til processen der kører portalen (System Settings →
 *     Privacy & Security → Full Disk Access → tilføj 'node' eller terminal)
 *   - chat.db er låst når Messages.app er aktiv-i-skrivning, men vi læser
 *     read-only via SQLite så det burde være ok i praksis
 *
 * Tracking:
 *   - last_seen_rowid gemmes i settings (key: 'imessage_poller_last_rowid')
 *   - Ved første start: sætter til nuværende max rowid → ingen historisk
 *     replay
 *
 * Kun beskeder der er:
 *   - is_from_me = 0 (modtaget, ikke sendt)
 *   - service = 'iMessage' (ikke fx SMS-relay til iPhone uden det er enabled)
 *   - text er ikke null (skipper attachments-only)
 */

import Database from "better-sqlite3";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { getSetting, setSetting } from "@/lib/settings";
import { getControlToken } from "@/lib/control/auth";
import { appendLog } from "@/lib/agent/log-buffer";
import { isEchoOfRecentReply } from "@/lib/agent/imessage-loop-guard";

const CHAT_DB = `${homedir()}/Library/Messages/chat.db`;
const LAST_ROWID_KEY = "imessage_poller_last_rowid";
const POLL_INTERVAL_MS = 30_000; // 30 sek
const ENABLED_KEY = "imessage_poller_enabled";

interface NewMessage {
  rowid: number;
  text: string;
  /** Apple-id eller telefonnummer for afsenderen */
  handleId: string;
}

let pollerTimer: NodeJS.Timeout | null = null;
let started = false;

export function isPollerEnabled(): boolean {
  return getSetting(ENABLED_KEY) === "true";
}

export function setPollerEnabled(enabled: boolean): void {
  setSetting(ENABLED_KEY, enabled ? "true" : "false");
  if (enabled && !pollerTimer) startPoller();
  if (!enabled && pollerTimer) stopPoller();
}

export function startPoller(): void {
  if (started) return;
  started = true;
  if (!isPollerEnabled()) {
    console.log("[imessage-poller] disabled (sæt imessage_poller_enabled=true i settings for at aktivere)");
    return;
  }
  if (!existsSync(CHAT_DB)) {
    console.warn(`[imessage-poller] chat.db findes ikke: ${CHAT_DB}`);
    return;
  }

  // Initialiser baseline ved første start så vi ikke replayer historik
  if (!getSetting(LAST_ROWID_KEY)) {
    try {
      const max = readMaxRowid();
      setSetting(LAST_ROWID_KEY, String(max));
      console.log(`[imessage-poller] initial baseline rowid=${max}`);
    } catch (e) {
      console.warn("[imessage-poller] kunne ikke læse chat.db (mangler Full Disk Access?):", e instanceof Error ? e.message : e);
      return;
    }
  }

  pollerTimer = setInterval(() => {
    pollOnce().catch((e) => console.error("[imessage-poller] fejl:", e));
  }, POLL_INTERVAL_MS);
  console.log(`[imessage-poller] aktiv · poll-interval=${POLL_INTERVAL_MS / 1000}s`);
}

export function stopPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  started = false;
}

function readMaxRowid(): number {
  const db = new Database(CHAT_DB, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT MAX(ROWID) as max FROM message").get() as { max: number | null };
    return row.max ?? 0;
  } finally {
    db.close();
  }
}

function readNewMessages(sinceRowid: number): NewMessage[] {
  const db = new Database(CHAT_DB, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT
           m.ROWID as rowid,
           m.text,
           h.id as handleId
         FROM message m
         LEFT JOIN handle h ON m.handle_id = h.ROWID
         WHERE m.ROWID > ?
           AND m.is_from_me = 0
           AND m.service = 'iMessage'
           AND m.text IS NOT NULL
           AND length(trim(m.text)) > 0
         ORDER BY m.ROWID ASC
         LIMIT 50`
      )
      .all(sinceRowid) as Array<{ rowid: number; text: string; handleId: string | null }>;
    return rows
      .filter((r) => r.handleId != null)
      .map((r) => ({ rowid: r.rowid, text: r.text, handleId: r.handleId as string }));
  } finally {
    db.close();
  }
}

async function pollOnce(): Promise<void> {
  if (!isPollerEnabled()) return;
  const since = parseInt(getSetting(LAST_ROWID_KEY) ?? "0", 10);
  let messages: NewMessage[];
  try {
    messages = readNewMessages(since);
  } catch (e) {
    // Stille fejl første gang FDA mangler — undgå log-spam
    if (e instanceof Error && /authorization denied|EACCES/i.test(e.message)) {
      return;
    }
    throw e;
  }
  if (messages.length === 0) return;

  for (const m of messages) {
    // Anti-loop: drop beskeder der matcher noget vi netop har sendt.
    // Sker pga iCloud-sync hvor brugerens egne devices viser hinandens
    // afsendte beskeder som "modtaget" i chat.db
    if (isEchoOfRecentReply(m.handleId, m.text)) {
      appendLog("warn", `echo skipped fra ${m.handleId}: ${m.text.slice(0, 60)}`, { tool: "imessage-poller" });
      setSetting(LAST_ROWID_KEY, String(m.rowid));
      continue;
    }

    appendLog("info", `iMessage modtaget fra ${m.handleId}: ${m.text.slice(0, 60)}`, { tool: "imessage-poller" });
    try {
      const port = process.env.PORT ?? "3100";
      const token = getControlToken();
      await fetch(`http://localhost:${port}/api/imessage/inbound`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ from: m.handleId, message: m.text }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      appendLog("error", `inbound dispatch fejl: ${e instanceof Error ? e.message : "ukendt"}`, { tool: "imessage-poller" });
    }
    setSetting(LAST_ROWID_KEY, String(m.rowid));
  }
}
