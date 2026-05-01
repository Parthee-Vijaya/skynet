/**
 * Telegram conversation-storage — persisterer inbound + outbound beskeder
 * i SQLite så cockpit-widget + reply-flow har en kilde til sandheden.
 *
 * Hvorfor en separat tabel og ikke bare log-bufferen?
 *  - Log-bufferen er kun memory og bliver renset ved restart
 *  - Vi vil have tråd-historik (sidste N beskeder pr. chat) til UI
 *  - Outbound-beskeder skal også med, så cockpit kan vise hele samtalen
 *
 * Skrivere:
 *   - telegram-poller         → recordInbound() når en inbound-update modtages
 *   - integrations/telegram   → recordOutbound() i sendMessage efter success
 *   - api/telegram/inbound    → opdaterer outbound-row med tools_used[] efter LLM-svar
 */
import { getDb } from "./db";

export interface TelegramRecord {
  id: number;
  chatId: string;
  direction: "in" | "out";
  sender: string | null;
  text: string;
  toolsUsed: string[] | null;
  messageId: number | null;
  createdAt: number;
}

interface Row {
  id: number;
  chat_id: string;
  direction: string;
  sender: string | null;
  text: string;
  tools_used: string | null;
  message_id: number | null;
  created_at: number;
}

function rowToRecord(r: Row): TelegramRecord {
  let tools: string[] | null = null;
  if (r.tools_used) {
    try {
      const parsed = JSON.parse(r.tools_used);
      if (Array.isArray(parsed)) tools = parsed.filter((s): s is string => typeof s === "string");
    } catch {
      tools = null;
    }
  }
  return {
    id: r.id,
    chatId: r.chat_id,
    direction: r.direction === "out" ? "out" : "in",
    sender: r.sender,
    text: r.text,
    toolsUsed: tools,
    messageId: r.message_id,
    createdAt: r.created_at,
  };
}

export function recordInbound(opts: {
  chatId: number | string;
  text: string;
  sender?: string | null;
  messageId?: number | null;
}): number {
  const stmt = getDb().prepare(
    `INSERT INTO telegram_messages (chat_id, direction, sender, text, message_id)
     VALUES (?, 'in', ?, ?, ?)`,
  );
  const r = stmt.run(
    String(opts.chatId),
    opts.sender ?? null,
    opts.text,
    opts.messageId ?? null,
  );
  return Number(r.lastInsertRowid);
}

export function recordOutbound(opts: {
  chatId: number | string;
  text: string;
  messageId?: number | null;
  toolsUsed?: string[] | null;
}): number {
  const stmt = getDb().prepare(
    `INSERT INTO telegram_messages (chat_id, direction, sender, text, tools_used, message_id)
     VALUES (?, 'out', 'skynet', ?, ?, ?)`,
  );
  const r = stmt.run(
    String(opts.chatId),
    opts.text,
    opts.toolsUsed && opts.toolsUsed.length > 0 ? JSON.stringify(opts.toolsUsed) : null,
    opts.messageId ?? null,
  );
  return Number(r.lastInsertRowid);
}

/** Sæt tools_used + message_id på en outbound-row efter LLM/send er kørt. */
export function annotateOutbound(id: number, opts: { toolsUsed?: string[] | null; messageId?: number | null }): void {
  if (opts.toolsUsed !== undefined) {
    getDb()
      .prepare("UPDATE telegram_messages SET tools_used = ? WHERE id = ?")
      .run(opts.toolsUsed && opts.toolsUsed.length > 0 ? JSON.stringify(opts.toolsUsed) : null, id);
  }
  if (opts.messageId !== undefined) {
    getDb().prepare("UPDATE telegram_messages SET message_id = ? WHERE id = ?").run(opts.messageId, id);
  }
}

/** Sidste N beskeder på tværs af alle chats (cockpit-widget) */
export function getRecentMessages(limit = 20): TelegramRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM telegram_messages ORDER BY created_at DESC LIMIT ?`)
    .all(Math.max(1, Math.min(200, limit))) as Row[];
  return rows.map(rowToRecord).reverse(); // oldest-first så UI kan rendere top→bund
}

/** Tråd-historik for én chat */
export function getMessagesForChat(chatId: number | string, limit = 50): TelegramRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM telegram_messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(String(chatId), Math.max(1, Math.min(500, limit))) as Row[];
  return rows.map(rowToRecord).reverse();
}

/** Distinct chat_ids sorteret efter seneste aktivitet */
export function listActiveChats(limit = 10): { chatId: string; lastAt: number; lastText: string }[] {
  const rows = getDb()
    .prepare(
      `SELECT chat_id, MAX(created_at) as last_at,
        (SELECT text FROM telegram_messages t2 WHERE t2.chat_id = t1.chat_id ORDER BY created_at DESC LIMIT 1) as last_text
       FROM telegram_messages t1
       GROUP BY chat_id
       ORDER BY last_at DESC
       LIMIT ?`,
    )
    .all(Math.max(1, Math.min(50, limit))) as { chat_id: string; last_at: number; last_text: string }[];
  return rows.map((r) => ({ chatId: r.chat_id, lastAt: r.last_at, lastText: r.last_text }));
}
