/**
 * /api/siri — enkel tekst-i-tekst-ud LLM-endpoint optimeret til Apple Shortcuts.
 *
 * Flow:
 *   Siri → "Skynet, hvad er vejret?"
 *   Shortcut: POST /api/siri { "q": "hvad er vejret?" }
 *   ← text/plain med et kort dansk svar som Siri læser højt
 *
 * Understøtter:
 *   - POST body: JSON { "q": "..." } | { "prompt": "..." } | plain text
 *   - GET ?q=... (til hurtig test med curl/browser)
 *
 * Svaret er altid plain text, max ~300 tegn, uden Markdown — så Siri/TTS
 * kan læse det direkte uden garbage.
 */

import { NextRequest } from "next/server";
import { getLLMConfig } from "@/lib/settings";
import { TOOLS } from "@/lib/agent/tools";
import { dispatchTool } from "@/lib/agent/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TURNS = 4;
const SIRI_SYSTEM = `Du er Skynet, en kort, venlig dansk voice-assistent.
Regler:
1. Svar ALTID på dansk
2. Max 2-3 korte sætninger (det læses højt af Siri)
3. INGEN Markdown, punktlister eller emojis — ren tekst
4. Brug tools (read_weather, read_energy, list_calendar_events, fetch_news, web_search) hvis brugeren spørger om data
5. Hvis data mangler eller tool fejler: sig det kort, ikke undskyld i lang stil`;

interface SiriReq {
  q?: string;
  prompt?: string;
  model?: string;
}

async function runLLM(prompt: string, model?: string): Promise<string> {
  const { baseUrl, apiKey } = getLLMConfig();
  const chosen = model ?? (await pickDefaultModel(baseUrl, apiKey));
  if (!chosen) throw new Error("ingen LLM-model tilgængelig");

  type Msg =
    | { role: "system" | "user" | "assistant"; content: string; tool_calls?: TcDef[] }
    | { role: "tool"; content: string; tool_call_id: string };
  type TcDef = { id: string; type: "function"; function: { name: string; arguments: string } };

  const conversation: Msg[] = [
    { role: "system", content: SIRI_SYSTEM },
    { role: "user", content: prompt },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: chosen,
        stream: false,
        messages: conversation,
        tools: TOOLS,
        tool_choice: "auto",
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`LM Studio HTTP ${res.status}: ${txt.slice(0, 120)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: TcDef[] } }>;
    };
    const msg = data.choices?.[0]?.message;
    const content = msg?.content?.trim() ?? "";
    const toolCalls = msg?.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return sanitize(content);
    }

    conversation.push({ role: "assistant", content, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /* noop */ }
      const result = await dispatchTool(
        { id: tc.id, name: tc.function.name, arguments: args },
        { allowDestructive: false },
      );
      conversation.push({ role: "tool", content: result.content, tool_call_id: tc.id });
    }
  }
  return "Beklager, jeg kunne ikke svare inden for tidsgrænsen.";
}

async function pickDefaultModel(baseUrl: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Strip markdown og begræns længde — Siri læser det højt. */
function sanitize(text: string): string {
  let t = text
    .replace(/^#{1,6}\s+/gm, "")       // overskrifter
    .replace(/\*\*(.+?)\*\*/g, "$1")   // fed
    .replace(/\*(.+?)\*/g, "$1")       // kursiv
    .replace(/`([^`]+)`/g, "$1")       // inline-kode
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^[-*]\s+/gm, "")         // punktlister
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > 500) t = t.slice(0, 497) + "…";
  return t || "Intet svar.";
}

async function extractPrompt(req: NextRequest): Promise<string | null> {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("q") ?? url.searchParams.get("prompt");
  if (fromQuery && fromQuery.trim()) return fromQuery.trim();

  if (req.method === "GET") return null;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const body = (await req.json()) as SiriReq;
      const p = (body.q ?? body.prompt ?? "").trim();
      return p || null;
    } catch {
      return null;
    }
  }
  // plain text body
  try {
    const text = (await req.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest): Promise<Response> {
  const prompt = await extractPrompt(req);
  if (!prompt) {
    return new Response(
      "Brug: /api/siri?q=DIN+FORESPØRGSEL eller POST med tekst/JSON {\"q\":\"...\"}",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  try {
    const url = new URL(req.url);
    const model = url.searchParams.get("model") ?? undefined;
    const answer = await runLLM(prompt, model);
    return new Response(answer, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Fejl: ${msg}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
