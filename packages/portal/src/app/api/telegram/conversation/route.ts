/**
 * /api/telegram/conversation
 *
 * GET  → sidste N beskeder (in + out, oldest-first) til cockpit-widget
 * POST → send manuel reply via cockpit ({ chatId, text })
 *
 * Auth-model: cockpit kører lokalt, så vi ikke bag bearer her — men
 * sendMessage-stien tjekker allowlist (telegram_allowed_chat_ids), så selv
 * hvis nogen rammer endpointet udefra kan de kun sende til chats der allerede
 * er godkendt.
 */
import { NextRequest } from "next/server";
import {
  getRecentMessages,
  getMessagesForChat,
  listActiveChats,
  recordOutbound,
  type TelegramRecord,
} from "@/lib/telegram-store";
import { sendMessage, TelegramError } from "@/lib/integrations/telegram";
import { getTelegramAllowedChatIds, getTelegramBotToken } from "@/lib/settings";
import { recordSentReply } from "@/lib/agent/imessage-loop-guard";
import { appendLog } from "@/lib/agent/log-buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ConversationResponse {
  messages: TelegramRecord[];
  chats: { chatId: string; lastAt: number; lastText: string }[];
  configured: boolean;
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const chatId = url.searchParams.get("chatId");
  const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const messages = chatId
    ? getMessagesForChat(chatId, limit)
    : getRecentMessages(limit);
  const chats = listActiveChats(10);
  const configured = !!getTelegramBotToken() && getTelegramAllowedChatIds().length > 0;
  return Response.json({ messages, chats, configured } satisfies ConversationResponse);
}

interface PostBody {
  chatId?: number | string;
  text?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) {
    return Response.json({ ok: false, error: "text er påkrævet" }, { status: 400 });
  }
  const chatIdNum =
    typeof body.chatId === "number" ? body.chatId : parseInt(String(body.chatId ?? ""), 10);
  if (!Number.isFinite(chatIdNum)) {
    return Response.json({ ok: false, error: "chatId er påkrævet" }, { status: 400 });
  }

  // Allowlist — belt-and-suspenders mod misbrug
  const allowed = getTelegramAllowedChatIds();
  if (!allowed.includes(String(chatIdNum))) {
    return Response.json(
      { ok: false, error: `chat_id ${chatIdNum} er ikke i allowlist` },
      { status: 403 },
    );
  }

  try {
    // Registrér i loop-guarden så polleren ikke racer (hvis bruger skriver
    // tilbage med samme tekst inden for 10 min)
    recordSentReply(`tg:${chatIdNum}`, text);
    const sent = await sendMessage({ chatId: chatIdNum, text });
    recordOutbound({ chatId: chatIdNum, text, messageId: sent.message_id });
    appendLog("ok", `Telegram cockpit-reply → chat=${chatIdNum}`, { tool: "telegram-cockpit" });
    return Response.json({ ok: true, messageId: sent.message_id });
  } catch (e) {
    if (e instanceof TelegramError) {
      return Response.json({ ok: false, error: e.message, code: e.code }, { status: 502 });
    }
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "ukendt fejl" },
      { status: 500 },
    );
  }
}
