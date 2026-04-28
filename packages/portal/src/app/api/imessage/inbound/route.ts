/**
 * /api/imessage/inbound — modtag indkommende iMessage og lad LLM svare
 *
 * Body: { "from": "+4512345678" | "navn@icloud.com", "message": "..." }
 *
 * Flow:
 *   1. Auth via control_token (samme bearer-pattern som /api/control/*)
 *   2. LLM kører med tools (web_search, web_fetch, fetch_news, schedule_imessage_reminder, …)
 *   3. LLM's slut-svar sendes som iMessage tilbage til 'from'
 *
 * Bruges af:
 *   - chat.db-polleren (jobs/imessage-poller.ts)
 *   - Apple Shortcut der trigges af "When I receive a message"
 *   - manuel test: curl -X POST http://localhost:3100/api/imessage/inbound \
 *       -H "Authorization: Bearer $TOKEN" \
 *       -d '{"from":"+4512345678","message":"tjek vejret"}'
 */

import { NextRequest } from "next/server";
import { getLLMConfig } from "@/lib/settings";
import { TOOLS } from "@/lib/agent/tools";
import { dispatchTool } from "@/lib/agent/dispatcher";
import { requireAuth } from "@/lib/control/auth";
import { appendLog } from "@/lib/agent/log-buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TURNS = 6;

const SYSTEM = `Du er Skynet, en hjælpsom dansk SMS/iMessage-assistent.
Brugeren sender dig korte beskeder; du svarer kort tilbage via samme kanal.

Regler:
1. Svar ALTID på dansk
2. Hold svar korte — max 4 linjer (det er en SMS)
3. Brug tools til at hente reel data (web_search, web_fetch, fetch_news, read_weather, read_energy, list_calendar_events)
4. Hvis brugeren beder om en påmindelse "X minutter før Y" eller "kl HH:MM": brug schedule_imessage_reminder med eksakt tidspunkt
5. Hvis brugeren beder om togtider, busser, fly osv.: søg på rejseplanen.dk eller relevant kilde via web_search/web_fetch
6. Når påmindelsen er oprettet: bekræft kort med tidspunkt
7. INGEN markdown, INGEN emojis (med mindre brugeren bruger dem)`;

interface InboundReq {
  from?: string;
  message?: string;
  /** Skip auto-reply (kun udfør tool-calls, fx schedule_imessage_reminder, men send ikke svar tilbage) */
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

  const from = (body.from ?? "").trim();
  const message = (body.message ?? "").trim();
  if (!from || !message) {
    return Response.json({ ok: false, error: "from + message er påkrævet" } satisfies InboundResp, { status: 400 });
  }

  appendLog("info", `inbound iMessage fra ${from}: ${message.slice(0, 80)}`, { tool: "imessage-inbound" });

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
    { role: "system", content: `${SYSTEM}\n\nBrugerens iMessage-adresse er ${from} — brug den hvis du opretter reminders til brugeren.` },
    { role: "user", content: message },
  ];

  const toolsUsed: string[] = [];
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: false,
        messages: conversation,
        tools: TOOLS,
        tool_choice: "auto",
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
      appendLog("tool", `inbound → ${tc.function.name}`, { tool: tc.function.name });
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

  // Trim til SMS-venlig længde
  const reply = finalText.length > 1500 ? finalText.slice(0, 1497) + "…" : finalText;

  // Send tilbage via send_imessage (medmindre silent=true)
  let replied = false;
  if (!body.silent) {
    const sendResult = await dispatchTool(
      {
        id: `inb_${Date.now().toString(36)}`,
        name: "send_imessage",
        arguments: { to: from, message: reply },
      },
      { allowDestructive: false },
    );
    replied = sendResult.ok;
    if (!sendResult.ok) {
      appendLog("error", `inbound reply fejl: ${sendResult.content.slice(0, 120)}`, { tool: "imessage-inbound" });
    } else {
      appendLog("ok", `inbound reply sendt → ${from}`, { tool: "imessage-inbound" });
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
