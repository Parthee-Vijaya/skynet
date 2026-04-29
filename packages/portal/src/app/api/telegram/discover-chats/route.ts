/**
 * GET /api/telegram/discover-chats
 *
 * Kalder Telegram's getUpdates uden at advance offset, parser unikke
 * chats ud, og returnerer dem i UI-venligt format. Hjælper brugeren
 * med at finde sit chat_id uden at jonglere med rå Telegram-URL'er.
 *
 * Note: getUpdates returnerer kun beskeder fra de seneste ~24 timer ELLER
 * indtil de er ack'ed med offset. Hvis polleren har consumed dem, vil
 * dette endpoint vise tom liste — så bed brugeren skrive til botten først.
 */

import { getUpdates, TelegramError } from "@/lib/integrations/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatSummary {
  chatId: number;
  type: string;
  title?: string;
  username?: string;
  firstName?: string;
  lastMessageText: string;
  lastMessageTs: number;
}

export async function GET(): Promise<Response> {
  try {
    const updates = await getUpdates({ timeoutSec: 1 });
    const map = new Map<number, ChatSummary>();
    for (const u of updates) {
      const m = u.message;
      if (!m) continue;
      const existing = map.get(m.chat.id);
      const summary: ChatSummary = {
        chatId: m.chat.id,
        type: m.chat.type,
        title: m.chat.title,
        username: m.chat.username ?? m.from?.username,
        firstName: m.chat.first_name ?? m.from?.first_name,
        lastMessageText: (m.text ?? "(ingen tekst)").slice(0, 80),
        lastMessageTs: m.date,
      };
      if (!existing || existing.lastMessageTs < summary.lastMessageTs) {
        map.set(m.chat.id, summary);
      }
    }
    const chats = [...map.values()].sort((a, b) => b.lastMessageTs - a.lastMessageTs);
    return Response.json({
      ok: true,
      total: updates.length,
      chats,
      hint: chats.length === 0
        ? "Ingen beskeder fundet. Skriv noget til botten i Telegram først (eller polleren har allerede consumed gamle updates — i så fald skriv en ny besked)."
        : undefined,
    });
  } catch (e) {
    if (e instanceof TelegramError) {
      return Response.json({
        ok: false,
        error: e.message,
        code: e.code,
        hint: e.code === 404 || e.code === 401
          ? "Bot-token er ugyldig — tjek at den har formatet 123456789:ABC... og er kopieret fra @BotFather"
          : e.code === -1
            ? "Bot-token mangler i settings — indsæt den ovenfor"
            : undefined,
      }, { status: 400 });
    }
    return Response.json({
      ok: false,
      error: e instanceof Error ? e.message : "ukendt fejl",
    }, { status: 500 });
  }
}
