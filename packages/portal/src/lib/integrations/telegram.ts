/**
 * Telegram Bot API-integration.
 *
 * Bot-flow:
 *   1. Bruger laver bot via @BotFather i Telegram → får token
 *   2. Bruger starter chat med bot → kan finde chat_id i den første /getUpdates
 *   3. Skynet long-poller /getUpdates med 25 sek timeout
 *   4. Hver besked → tjek allowlist → forward til /api/telegram/inbound
 *   5. Reply via /sendMessage
 *
 * Long-polling er valgt frem for webhooks fordi:
 *   - Ingen offentlig URL nødvendig (Skynet kører lokalt)
 *   - Mindre opsætning (ingen ngrok/Tailscale-funnel)
 *   - Telegram queue'r beskeder mens vi er offline (ingen tab)
 */

import { getTelegramBotToken } from "@/lib/settings";

export class TelegramError extends Error {
  constructor(message: string, public readonly code?: number) {
    super(message);
    this.name = "TelegramError";
  }
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

const API = "https://api.telegram.org";

async function call<T>(
  method: string,
  params: Record<string, unknown> = {},
  opts: { token?: string; timeoutMs?: number } = {},
): Promise<T> {
  const token = opts.token ?? getTelegramBotToken();
  if (!token) {
    throw new TelegramError("Telegram bot-token ikke konfigureret", -1);
  }
  const url = `${API}/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (!res.ok) {
    let body: ApiResponse<T> | null = null;
    try { body = (await res.json()) as ApiResponse<T>; } catch { /* noop */ }
    const code = body?.error_code ?? res.status;
    const desc = body?.description ?? `HTTP ${res.status}`;
    throw new TelegramError(desc, code);
  }
  const data = (await res.json()) as ApiResponse<T>;
  if (!data.ok) {
    throw new TelegramError(data.description ?? "Telegram API ok=false", data.error_code);
  }
  return data.result as T;
}

/** Returnerer info om botten — verificer at token virker. */
export async function getMe(token?: string): Promise<{ id: number; username: string; first_name: string }> {
  return await call("getMe", {}, { token });
}

/** Hent nye updates med long-polling. Blokerer op til timeout sek. */
export async function getUpdates(opts: { offset?: number; timeoutSec?: number } = {}): Promise<TelegramUpdate[]> {
  const timeoutSec = Math.max(1, Math.min(50, opts.timeoutSec ?? 25));
  // HTTP-timeout = telegram-timeout + lille buffer
  return await call<TelegramUpdate[]>(
    "getUpdates",
    {
      offset: opts.offset,
      timeout: timeoutSec,
      // Drop edited_message + channel_post — fokuser på almindelige private chat-beskeder
      allowed_updates: ["message"],
    },
    { timeoutMs: (timeoutSec + 10) * 1000 },
  );
}

/** Send tekstbesked til chat. Returnerer message_id. */
export async function sendMessage(opts: {
  chatId: number | string;
  text: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
  disableNotification?: boolean;
  replyToMessageId?: number;
}): Promise<{ message_id: number }> {
  // Telegram max 4096 tegn pr besked
  const text = opts.text.length > 4096 ? opts.text.slice(0, 4093) + "…" : opts.text;
  return await call("sendMessage", {
    chat_id: opts.chatId,
    text,
    parse_mode: opts.parseMode,
    disable_notification: opts.disableNotification,
    reply_to_message_id: opts.replyToMessageId,
  });
}

/** Send "indtaster…"-indikator. Telegram viser det i max 5 sek. */
export async function sendTyping(chatId: number | string): Promise<void> {
  try {
    await call("sendChatAction", { chat_id: chatId, action: "typing" });
  } catch { /* noop */ }
}
