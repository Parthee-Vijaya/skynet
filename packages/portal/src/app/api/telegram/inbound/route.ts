/**
 * /api/telegram/inbound — modtag en Telegram-besked og lad LLM svare.
 *
 * Body: { "chatId": <number>, "message": "...", "replyToMessageId"?, "username"? }
 *
 * Auth: control_token bearer (samme pattern som /api/imessage/inbound).
 *
 * Flow:
 *   1. Tjek allowlist (telegram_allowed_chat_ids) — afvis hvis ikke
 *   2. Skip echo (besked matcher noget vi netop har sendt)
 *   3. In-flight semaphore pr. chat (forhindrer race)
 *   4. LLM med tools, første turn forced (tool_choice='required')
 *   5. Reply via Telegram sendMessage
 */

import { NextRequest } from "next/server";
import { getLLMConfig, getTelegramAllowedChatIds } from "@/lib/settings";
import { TOOLS } from "@/lib/agent/tools";
import { dispatchTool } from "@/lib/agent/dispatcher";
import { requireAuth } from "@/lib/control/auth";
import { appendLog } from "@/lib/agent/log-buffer";
import { sendMessage, sendTyping, TelegramError } from "@/lib/integrations/telegram";
import { recordOutbound } from "@/lib/telegram-store";

// Genbruger samme loop-guard som iMessage — ved at bruge en chatId-prefix er
// der ingen risiko for cross-channel kollisioner
import {
  isEchoOfRecentReply,
  recordSentReply,
  tryAcquireInbound,
  releaseInbound,
} from "@/lib/agent/imessage-loop-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TURNS = 6;

const SYSTEM = `Du er Skynet, en hjælpsom dansk Telegram-assistent.
Brugeren chatter med dig fra Telegram-appen; du svarer kort tilbage via samme chat.

Regler:
1. Svar ALTID på dansk
2. Hold svar relativt korte — max 5 linjer (men du kan bruge Telegram-markdown hvis det er værd)
3. Svar PRÆCIST på det brugeren spurgte om — gentag aldrig en tidligere besked
4. Du har ALTID adgang til realtids-data via tools. På første turn SKAL du kalde et tool — også for åbne spørgsmål. Vælg det mest specifikke tool fra tabellen nedenfor; brug web_search hvis intet andet passer. Opfind ALDRIG fakta du ikke har slået op
5. Påmindelser ("X minutter før Y" / "kl HH:MM"): brug schedule_telegram_reminder. Hvis du har slået en afgangstid op først, beregn (afgang - X min) som sendAtIso. Ingen iMessage — brugeren chatter via Telegram
6. Echo-detection: hvis brugerens besked ligner noget DU lige skrev, er det en bug — svar sagligt, gentag IKKE

TOOL-VALG (brug det MEST specifikke før du går til web_search):

  Vejr:           read_weather (nu) · get_forecast (1-7 dage frem)
  Vejrvarsler:    get_weather_warnings (storm/sne/glat vej)
  Luft/pollen:    read_air_quality
  Energi:         read_energy
  Trafik (vej):   read_traffic
  Tog/bus:        find_train_route (Rejseplanen)
  Markeder:       read_markets
  Måne:           read_moon
  Fly:            read_flights
  Adresser:       lookup_address
  Fakta:          wikipedia_summary
  Nyheder:        get_news (scope dk/world/both)
  Reddit:         reddit_search
  Opskrifter:     search_recipes
  Film/TV-NZB:    search_nzbgeek
  Reminder:       schedule_telegram_reminder (one-off Telegram-påmindelse)
  Send Telegram:  send_telegram_message (proaktiv besked til en anden chat)
  Generel web:    web_search → web_fetch (kun hvis intet ovenfor passer)`;

interface InboundReq {
  chatId?: number;
  message?: string;
  replyToMessageId?: number;
  username?: string;
  /** Skip auto-reply (kun udfør tool-calls, send ikke besked tilbage) */
  silent?: boolean;
}

interface InboundResp {
  ok: boolean;
  reply?: string;
  replied?: boolean;
  error?: string;
  toolsUsed?: string[];
}

export async function POST(req: NextRequest): Promise<Response> {
  const authFail = requireAuth(req);
  if (authFail) return authFail;

  let body: InboundReq;
  try {
    body = (await req.json()) as InboundReq;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" } satisfies InboundResp, { status: 400 });
  }

  const chatId = body.chatId;
  const message = (body.message ?? "").trim();
  if (typeof chatId !== "number" || !message) {
    return Response.json({ ok: false, error: "chatId + message er påkrævet" } satisfies InboundResp, { status: 400 });
  }

  // Allowlist (belt-and-suspenders — polleren tjekker også, men endpointet
  // kan kaldes direkte fx via Apple Shortcut, så vi tjekker også her)
  const allowed = getTelegramAllowedChatIds();
  if (allowed.length === 0) {
    appendLog("warn", `Telegram afvist · ingen allowlist · chat_id=${chatId}`, { tool: "telegram-inbound" });
    return Response.json({ ok: false, error: "Ingen allowlist sat — botten svarer ikke" } satisfies InboundResp, { status: 403 });
  }
  if (!allowed.includes(String(chatId))) {
    appendLog("warn", `Telegram afvist · chat_id=${chatId} ikke i allowlist`, { tool: "telegram-inbound" });
    return Response.json({ ok: false, error: "chat_id ikke tilladt" } satisfies InboundResp, { status: 403 });
  }

  const fromKey = `tg:${chatId}`;

  // Anti-echo: matcher noget vi netop har sendt → skip
  if (isEchoOfRecentReply(fromKey, message)) {
    appendLog("warn", `Telegram echo skipped · chat=${chatId}`, { tool: "telegram-inbound" });
    return Response.json({ ok: true, reply: undefined, replied: false, error: "echo of recent reply" } satisfies InboundResp);
  }

  // In-flight: kun én behandling pr. chat
  if (!tryAcquireInbound(fromKey)) {
    return Response.json({ ok: false, error: "already processing previous message" } satisfies InboundResp, { status: 429 });
  }

  try {
    return await handleInbound(chatId, message, body.replyToMessageId, body.silent === true);
  } finally {
    releaseInbound(fromKey);
  }
}

async function handleInbound(
  chatId: number,
  message: string,
  replyToMessageId: number | undefined,
  silent: boolean,
): Promise<Response> {
  appendLog("info", `Telegram inbound chat=${chatId}: ${message.slice(0, 80)}`, { tool: "telegram-inbound" });

  // Vis "indtaster…" mens LLM tænker (bedre UX i Telegram)
  if (!silent) sendTyping(chatId).catch(() => { /* noop */ });

  const { baseUrl, apiKey, defaultModel } = getLLMConfig();
  const model = defaultModel || (await pickDefaultModel(baseUrl, apiKey));
  if (!model) {
    return Response.json({ ok: false, error: "ingen LLM-model tilgængelig" } satisfies InboundResp, { status: 503 });
  }

  type Msg =
    | { role: "system" | "user" | "assistant"; content: string; tool_calls?: TcDef[] }
    | { role: "tool"; content: string; tool_call_id: string };
  type TcDef = { id: string; type: "function"; function: { name: string; arguments: string } };

  const conversation: Msg[] = [
    { role: "system", content: `${SYSTEM}\n\nBrugerens Telegram chat_id er ${chatId} — brug det hvis du opretter reminders.` },
    { role: "user", content: message },
  ];

  const toolsUsed: string[] = [];
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const toolChoice = turn === 0 ? "required" : "auto";
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: false,
        messages: conversation,
        tools: TOOLS,
        tool_choice: toolChoice,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return Response.json({ ok: false, error: `LLM HTTP ${res.status}: ${t.slice(0, 160)}`, toolsUsed } satisfies InboundResp, { status: 502 });
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: TcDef[] } }>;
    };
    const msg = data.choices?.[0]?.message;
    const content = msg?.content?.trim() ?? "";
    const toolCalls = msg?.tool_calls ?? [];

    if (toolCalls.length === 0) {
      finalText = content;
      break;
    }

    conversation.push({ role: "assistant", content, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try { parsedArgs = JSON.parse(tc.function.arguments); } catch { /* noop */ }
      toolsUsed.push(tc.function.name);
      appendLog("tool", `telegram → ${tc.function.name}`, { tool: tc.function.name });
      const result = await dispatchTool(
        { id: tc.id, name: tc.function.name, arguments: parsedArgs },
        { allowDestructive: false },
      );
      conversation.push({ role: "tool", content: result.content, tool_call_id: tc.id });
    }
  }

  if (!finalText) {
    return Response.json({ ok: false, error: "tomt LLM-svar efter MAX_TURNS", toolsUsed } satisfies InboundResp, { status: 502 });
  }

  const reply = finalText;
  let replied = false;

  if (!silent) {
    // Registrér INDEN vi sender, så polleren ikke racer os
    recordSentReply(`tg:${chatId}`, reply);
    try {
      const sent = await sendMessage({ chatId, text: reply, replyToMessageId });
      replied = true;
      try {
        recordOutbound({
          chatId,
          text: reply,
          messageId: sent.message_id,
          toolsUsed: toolsUsed.length > 0 ? toolsUsed : null,
        });
      } catch (storeErr) {
        appendLog("warn", `Telegram store-outbound fejl: ${storeErr instanceof Error ? storeErr.message : "ukendt"}`, { tool: "telegram-inbound" });
      }
      appendLog("ok", `Telegram reply sendt → chat=${chatId}`, { tool: "telegram-inbound" });
    } catch (e) {
      const msg = e instanceof TelegramError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : "ukendt");
      appendLog("error", `Telegram reply fejl: ${msg.slice(0, 120)}`, { tool: "telegram-inbound" });
    }
  }

  return Response.json({ ok: true, reply, replied, toolsUsed } satisfies InboundResp);
}

async function pickDefaultModel(baseUrl: string, apiKey: string): Promise<string | null> {
  try {
    const r = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { data?: Array<{ id: string }> };
    return d.data?.[0]?.id ?? null;
  } catch { return null; }
}
