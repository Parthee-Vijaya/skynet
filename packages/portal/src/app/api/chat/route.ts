/**
 * POST /api/chat — streaming chat-endpoint med tool-calling.
 *
 * Refaktoreret til at bruge runAgentStream (Phase 4) — én delt LangChain-
 * baseret agent-loop på tværs af /api/siri, /api/telegram/inbound,
 * /api/imessage/inbound og denne her. Streaming-protokollen mod klienten
 * er uændret — /chat-siden bruger samme NDJSON-format.
 *
 * Protokol (NDJSON til klienten):
 *   {"type":"delta","text":"..."}
 *   {"type":"tool_call","id":"...","name":"...","args":{...}}
 *   {"type":"tool_result","id":"...","name":"...","ok":true,"content":"...","blocked":false}
 *   {"type":"usage","usage":{...}}
 *   {"type":"done","finishReason":"stop"}
 *   {"type":"error","message":"..."}
 */
import { NextRequest } from "next/server";
import { getLLMConfig } from "@/lib/settings";
import { runAgentStream, type PriorMessage } from "@/lib/agent/langchain-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatReqMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface ChatReq {
  messages: ChatReqMessage[];
  model: string;
  systemPrompt?: string;
  /** Sæt true for at aktivere tool-calling (default: true) */
  tools?: boolean;
  /** Bekræft destruktive tool-actions (stop/restart/quit) */
  confirmDestructive?: boolean;
}

export async function POST(req: NextRequest) {
  let body: ChatReq;
  try {
    body = (await req.json()) as ChatReq;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages, model, systemPrompt } = body;
  const useTools = body.tools !== false;
  const allowDestructive = body.confirmDestructive === true;

  if (!Array.isArray(messages) || !model) {
    return new Response(JSON.stringify({ error: "missing messages or model" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { systemPrompt: defaultSystem } = getLLMConfig();
  const sys = (systemPrompt ?? defaultSystem).trim() || "Du er Skynet.";

  // /chat-siden sender hele samtale-historikken hver gang. Sidste user-msg
  // bliver vores nye prompt; resten konverteres til priorMessages. Tool-rolle
  // og tidligere tool_calls droppes — vi replay'er kun ren user/assistant
  // tekst (samme strategi som telegram-memory).
  const filtered = messages.filter((m) => m.role === "user" || m.role === "assistant");
  let userMessage = "";
  let priorMessages: PriorMessage[] = [];
  if (filtered.length === 0) {
    return new Response(JSON.stringify({ error: "messages must contain at least one user message" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  // Sidste besked SKAL være user — ellers er det en bug i klienten
  const last = filtered[filtered.length - 1];
  if (last.role !== "user") {
    return new Response(JSON.stringify({ error: "last message must be from user" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  userMessage = last.content;
  priorMessages = filtered.slice(0, -1).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        for await (const ev of runAgentStream({
          userMessage,
          systemPrompt: sys,
          priorMessages,
          useTools,
          forceFirstTool: false,
          maxTurns: 5,
          model,
          allowDestructive,
          logTag: "chat",
        })) {
          emit(ev);
        }
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
