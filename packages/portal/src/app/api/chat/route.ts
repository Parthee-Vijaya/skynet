import { NextRequest } from "next/server";
import { getLLMConfig } from "@/lib/settings";
import { TOOLS } from "@/lib/agent/tools";
import { dispatchTool, type ToolCallRequest } from "@/lib/agent/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatReqMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  /** Kun relevant for role='tool' — id fra assistant's tool_call */
  tool_call_id?: string;
  /** Kun relevant for role='assistant' med tool-calls */
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

interface OaiToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}

interface OaiDelta {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: OaiToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface AssembledToolCall {
  id: string;
  name: string;
  args: string; // rå argumenter-streng, parses til JSON når komplet
}

/**
 * POST /api/chat — med tool-calling loop.
 *
 * Protokol (NDJSON til klienten):
 *   {"type":"delta","text":"..."}
 *   {"type":"tool_call","id":"...","name":"...","args":{...}}
 *   {"type":"tool_result","id":"...","name":"...","ok":true,"content":"...","blocked":false}
 *   {"type":"usage","usage":{...}}
 *   {"type":"done","finishReason":"stop"}
 *   {"type":"error","message":"..."}
 */
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

  const { baseUrl, apiKey, systemPrompt: defaultSystem } = getLLMConfig();
  const sys = (systemPrompt ?? defaultSystem).trim();

  // Bygger et multi-turn workspace som vi fylder på efterhånden som tools kaldes
  const conversation: ChatReqMessage[] = [
    ...(sys ? [{ role: "system" as const, content: sys }] : []),
    ...messages,
  ];

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      let aggregatedUsage: OaiDelta["usage"] | undefined;
      let finalFinishReason: string | null = null;

      // Multi-turn loop: LLM svarer evt. med tool_calls → vi eksekverer → sender
      // resultat tilbage → LLM svarer igen osv. Maks 5 runder for at undgå
      // infinite loops.
      const MAX_TURNS = 5;

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const payload = {
            model,
            stream: true,
            stream_options: { include_usage: true },
            messages: conversation.map(serializeMessage),
            ...(useTools ? { tools: TOOLS, tool_choice: "auto" as const } : {}),
          };

          const upstream = await fetch(
            `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(120_000),
            }
          );

          if (!upstream.ok || !upstream.body) {
            const text = await upstream.text().catch(() => "");
            throw new Error(
              `LM Studio svarede ${upstream.status}: ${text.slice(0, 400)}`
            );
          }

          // Buffer til at samle tool_calls fra stream-deltas (OpenAI sender
          // dem i bidder — name/args kan være split over flere chunks)
          const toolCalls: Map<number, AssembledToolCall> = new Map();
          let assistantText = "";
          let turnFinishReason: string | null = null;

          const reader = upstream.body.getReader();
          let buffer = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let sep: number;
            while ((sep = buffer.indexOf("\n\n")) !== -1) {
              const rawEvent = buffer.slice(0, sep);
              buffer = buffer.slice(sep + 2);
              for (const line of rawEvent.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const data = trimmed.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data) as OaiDelta;
                  const choice = parsed.choices?.[0];
                  const delta = choice?.delta;

                  if (delta?.content) {
                    assistantText += delta.content;
                    emit({ type: "delta", text: delta.content });
                  }

                  if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      const idx = tc.index;
                      const existing = toolCalls.get(idx) ?? {
                        id: "",
                        name: "",
                        args: "",
                      };
                      if (tc.id) existing.id = tc.id;
                      if (tc.function?.name) existing.name = tc.function.name;
                      if (tc.function?.arguments)
                        existing.args += tc.function.arguments;
                      toolCalls.set(idx, existing);
                    }
                  }

                  if (choice?.finish_reason) {
                    turnFinishReason = choice.finish_reason;
                  }
                  if (parsed.usage) {
                    aggregatedUsage = mergeUsage(aggregatedUsage, parsed.usage);
                  }
                } catch {
                  // ignorer ugyldig chunk
                }
              }
            }
          }

          // Hvis ingen tool_calls i denne turn — vi er færdige
          if (toolCalls.size === 0) {
            finalFinishReason = turnFinishReason ?? "stop";
            break;
          }

          // Vi har tool-calls. Tilføj assistantens "tool_calls"-besked til
          // konversationen, eksekvér, send resultater tilbage.
          const tcArray = Array.from(toolCalls.values()).map((tc) => ({
            id: tc.id || `tc_${Math.random().toString(36).slice(2, 10)}`,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.args || "{}" },
          }));

          conversation.push({
            role: "assistant",
            content: assistantText,
            tool_calls: tcArray,
          });

          // Eksekver tools parallelt og send både invocation + resultat til UI
          const toolResults = await Promise.all(
            tcArray.map(async (tc) => {
              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments);
              } catch {
                parsedArgs = {};
              }

              emit({
                type: "tool_call",
                id: tc.id,
                name: tc.function.name,
                args: parsedArgs,
              });

              const req: ToolCallRequest = {
                id: tc.id,
                name: tc.function.name,
                arguments: parsedArgs,
              };
              const res = await dispatchTool(req, { allowDestructive });

              emit({
                type: "tool_result",
                id: tc.id,
                name: tc.function.name,
                ok: res.ok,
                blocked: res.blocked,
                content: res.content,
              });

              return {
                id: tc.id,
                name: tc.function.name,
                content: res.content,
              };
            })
          );

          // Føj tool-resultater til konversationen så LLM'en kan bruge dem i
          // næste tur
          for (const tr of toolResults) {
            conversation.push({
              role: "tool",
              content: tr.content,
              tool_call_id: tr.id,
            });
          }

          // Hvis finish_reason ikke er "tool_calls" — LLM er færdig alligevel
          if (turnFinishReason && turnFinishReason !== "tool_calls") {
            finalFinishReason = turnFinishReason;
            break;
          }
          // Ellers loop'er vi videre — LLM vil generere tekst baseret på tool-resultater
        }

        if (aggregatedUsage) emit({ type: "usage", usage: aggregatedUsage });
        emit({ type: "done", finishReason: finalFinishReason ?? "stop" });
      } catch (e) {
        emit({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
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

/**
 * Serialiser en intern-besked til OpenAI-format. role='tool' har krav om
 * tool_call_id; role='assistant' med tool_calls skal have det med.
 */
function serializeMessage(m: ChatReqMessage): Record<string, unknown> {
  if (m.role === "tool") {
    return {
      role: "tool",
      content: m.content,
      tool_call_id: m.tool_call_id,
    };
  }
  if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
    return {
      role: "assistant",
      content: m.content,
      tool_calls: m.tool_calls,
    };
  }
  return { role: m.role, content: m.content };
}

function mergeUsage(
  a: OaiDelta["usage"] | undefined,
  b: OaiDelta["usage"] | undefined
): OaiDelta["usage"] | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    prompt_tokens: (a.prompt_tokens ?? 0) + (b.prompt_tokens ?? 0),
    completion_tokens: (a.completion_tokens ?? 0) + (b.completion_tokens ?? 0),
    total_tokens: (a.total_tokens ?? 0) + (b.total_tokens ?? 0),
  };
}
