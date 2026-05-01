/**
 * LangChain-baseret agent-loop — én helper som de tre inbound-endpoints
 * (/api/siri, /api/telegram/inbound, /api/imessage/inbound) deler i stedet
 * for hver sin håndskrevne `fetch chat/completions`-løkke.
 *
 * Hvorfor LangChain?
 *   - Multi-provider abstraktion: ChatOpenAI dækker LM Studio + Gemini's
 *     OpenAI-compat-mode i samme kode. Hvis vi senere vil skifte til
 *     ChatAnthropic eller streaming, er det én linjes ændring.
 *   - Foundation for memory (MemorySaver) + streaming (model.stream) i
 *     senere faser. Phase 1 her er ren parity-refaktor.
 *
 * Hvad vi IKKE ændrer:
 *   - tools.ts — beholder OpenAI JSON-schema format. LangChain accepterer
 *     dem direkte via .bind({ tools: TOOLS }).
 *   - dispatcher.ts — handlers bevares 1:1. Vi kalder dispatchTool fra
 *     loop'en præcis som før.
 */

import { ChatOpenAI } from "@langchain/openai";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { getLLMConfig } from "@/lib/settings";
import { TOOLS } from "./tools";
import { dispatchTool } from "./dispatcher";
import { appendLog } from "./log-buffer";

export interface LangChainAgentOptions {
  /** Brugerens prompt — sendes som første HumanMessage */
  userMessage: string;
  /** System-prompten (mode-specifik — siri/telegram/imessage har hver sin) */
  systemPrompt: string;
  /** Maks. tool-runde-antal før vi bryder ud (default 6) */
  maxTurns?: number;
  /** Force tool-use på første turn (default true — giver LLM'en push til at slå op før den svarer) */
  forceFirstTool?: boolean;
  /** Tag der vises i log-bufferen (fx "siri", "telegram-inbound") */
  logTag?: string;
  /** Per-request timeout pr. LLM-kald i ms (default 60s) */
  timeoutMs?: number;
  /** Override model (ellers picks defaultModel fra settings, eller første /models-svar) */
  model?: string;
  /** Hvis true må dispatcheren køre destruktive tools (stop/restart) — default false */
  allowDestructive?: boolean;
}

export interface LangChainAgentResult {
  text: string;
  toolsUsed: string[];
  /** Antal LLM-runder vi nåede inden vi fik et endeligt svar */
  turns: number;
}

/**
 * Kør en agent-loop med LangChain's ChatOpenAI mod den konfigurerede
 * baseUrl/apiKey/model. Returnerer endelig assistant-tekst + tools brugt.
 */
export async function runAgent(opts: LangChainAgentOptions): Promise<LangChainAgentResult> {
  const { baseUrl, apiKey, defaultModel } = getLLMConfig();
  const maxTurns = opts.maxTurns ?? 6;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const forceFirstTool = opts.forceFirstTool ?? true;
  const allowDestructive = opts.allowDestructive ?? false;

  const model = opts.model || defaultModel || (await pickDefaultModel(baseUrl, apiKey));
  if (!model) {
    throw new Error("ingen LLM-model tilgængelig — sæt llm_default_model eller verificér /models");
  }

  // ChatOpenAI-konstruktøren accepterer både OpenAI's eget endpoint og
  // OpenAI-compat servers (LM Studio på :1234, Gemini's /v1beta/openai/, etc.)
  // via configuration.baseURL.
  const baseLLM = new ChatOpenAI({
    apiKey,
    model,
    timeout: timeoutMs,
    configuration: { baseURL: baseUrl.replace(/\/+$/, "") },
  });

  const messages: BaseMessage[] = [
    new SystemMessage(opts.systemPrompt),
    new HumanMessage(opts.userMessage),
  ];

  const toolsUsed: string[] = [];
  let finalText = "";
  let turn = 0;

  // bindTools binder tool-listen én gang så vi ikke gør det per turn.
  // tool_choice ændrer sig per turn, så vi sender det som invoke-options.
  const llmWithTools = baseLLM.bindTools(TOOLS);

  for (turn = 0; turn < maxTurns; turn++) {
    // tool_choice="required" på første turn presser LLM til at slå op før
    // den svarer — det er samme adfærd som de gamle håndskrevne loops.
    const toolChoice = forceFirstTool && turn === 0 ? "required" : "auto";
    const response = (await llmWithTools.invoke(messages, { tool_choice: toolChoice })) as AIMessage;
    messages.push(response);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // LLM svarede med tekst — vi er færdige
      finalText = extractText(response);
      break;
    }

    // Eksekver hver tool og append resultatet som ToolMessage
    for (const tc of toolCalls) {
      const name = tc.name;
      const args = (tc.args ?? {}) as Record<string, unknown>;
      const callId = tc.id ?? `${name}-${turn}`;
      toolsUsed.push(name);
      if (opts.logTag) {
        appendLog("tool", `${opts.logTag} → ${name}`, { tool: name });
      }
      const result = await dispatchTool(
        { id: callId, name, arguments: args },
        { allowDestructive },
      );
      messages.push(
        new ToolMessage({
          content: result.content,
          tool_call_id: callId,
        }),
      );
    }
  }

  if (!finalText) {
    throw new Error(`Tomt LLM-svar efter ${maxTurns} runder (turns=${turn}, toolsUsed=${toolsUsed.join(",")})`);
  }

  return { text: finalText, toolsUsed, turns: turn + 1 };
}

/** Pluk teksten ud af en AIMessage — content kan være string eller array af parts */
function extractText(msg: AIMessage): string {
  const c = msg.content;
  if (typeof c === "string") return c.trim();
  if (Array.isArray(c)) {
    return c
      .map((part) => (typeof part === "string" ? part : "text" in part ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

/**
 * Slå første tilgængelige model op via /models når brugeren ikke har
 * sat en default. Kortfattet med 3s timeout — vi vil hellere fejle hurtigt
 * end hænge på en død server.
 */
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
