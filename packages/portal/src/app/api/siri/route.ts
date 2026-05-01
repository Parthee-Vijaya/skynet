/**
 * /api/siri — enkel tekst-i-tekst-ud LLM-endpoint optimeret til Apple Shortcuts
 * og HUD's voice-command "Skynet kør X"-flow.
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
 * Svaret er altid plain text, max ~500 tegn, uden Markdown — så Siri/TTS
 * kan læse det direkte uden garbage.
 *
 * Refaktoreret til LangChain-runner (Phase 1) — ingen adfærdsændring,
 * blot delt agent-loop med /api/telegram/inbound og /api/imessage/inbound.
 */

import { NextRequest } from "next/server";
import { runAgent } from "@/lib/agent/langchain-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/** Strip markdown og begræns længde — Siri læser det højt. */
function sanitize(text: string): string {
  let t = text
    .replace(/^#{1,6}\s+/gm, "")              // overskrifter
    .replace(/\*\*(.+?)\*\*/g, "$1")          // fed
    .replace(/\*(.+?)\*/g, "$1")              // kursiv
    .replace(/`([^`]+)`/g, "$1")              // inline-kode
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // links
    .replace(/^[-*]\s+/gm, "")                // punktlister
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
    const result = await runAgent({
      userMessage: prompt,
      systemPrompt: SIRI_SYSTEM,
      // Siri-stien har historisk haft tool_choice="auto" (ikke required) fordi
      // brugeren ofte siger "tak" eller andre helt åbne ting hvor tool er
      // overkill. Bevarer den adfærd her.
      forceFirstTool: false,
      maxTurns: 4,
      logTag: "siri",
      model,
    });
    const answer = sanitize(result.text);
    return new Response(answer, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        // Telemetri-headers — Apple Shortcut læser dem ikke, men cURL gør
        "X-Tools-Used": result.toolsUsed.join(",") || "none",
        "X-Turns": String(result.turns),
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
