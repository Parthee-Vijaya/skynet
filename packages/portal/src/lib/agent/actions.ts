/**
 * Executor for automation-actions. Kan kaldes fra scheduler-jobs, threshold-
 * checks eller "kør nu"-knappen i UI.
 */

import type { Action, LLMNotifyAction, NotifyAction, ToolAction } from "./types";
import { notify } from "../notify";
import { dispatchTool } from "./dispatcher";
import { getLLMConfig } from "../settings";
import { TOOLS } from "./tools";

export interface ActionResult {
  ok: boolean;
  message: string;
}

export async function runAction(action: Action): Promise<ActionResult> {
  try {
    switch (action.type) {
      case "notify":
        return await runNotify(action);
      case "tool":
        return await runTool(action);
      case "llm_notify":
        return await runLLMNotify(action);
      default: {
        const exhaustive: never = action;
        return { ok: false, message: `Ukendt action-type: ${JSON.stringify(exhaustive)}` };
      }
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runNotify(a: NotifyAction): Promise<ActionResult> {
  const results = await notify({
    title: a.title,
    body: a.body,
    priority: a.priority,
    tag: a.tag,
    url: a.url,
  });
  const okCount = results.filter((r) => r.ok).length;
  const failures = results.filter((r) => !r.ok);
  if (results.length === 0) {
    return { ok: false, message: "Ingen notify-backends aktiveret" };
  }
  if (failures.length === 0) {
    return { ok: true, message: `sendt via ${results.map((r) => r.backend).join(", ")}` };
  }
  return {
    ok: okCount > 0,
    message: `${okCount}/${results.length} lykkedes · fejl: ${failures
      .map((f) => `${f.backend}=${f.error}`)
      .join(" · ")}`,
  };
}

async function runTool(a: ToolAction): Promise<ActionResult> {
  const res = await dispatchTool(
    {
      id: `auto_${Date.now().toString(36)}`,
      name: a.tool,
      arguments: a.args,
    },
    { allowDestructive: a.allowDestructive === true }
  );
  if (res.blocked) {
    return { ok: false, message: `blokeret: ${res.blockReason ?? "destruktiv action"}` };
  }
  return {
    ok: res.ok,
    message: res.ok
      ? `${a.tool} ok · ${summarize(res.content)}`
      : `${a.tool} fejl · ${summarize(res.content)}`,
  };
}

async function runLLMNotify(a: LLMNotifyAction): Promise<ActionResult> {
  const { baseUrl, apiKey, systemPrompt: defaultSys } = getLLMConfig();
  const sys = a.systemPrompt?.trim() || defaultSys;
  const model = a.model || (await pickDefaultModel(baseUrl, apiKey));
  if (!model) {
    return { ok: false, message: "ingen model valgt og ingen default fundet" };
  }

  const useTools = a.useTools !== false; // default: tools aktive
  const MAX_TURNS = 5;

  type Msg =
    | { role: "system" | "user" | "assistant"; content: string; tool_calls?: TcDef[] }
    | { role: "tool"; content: string; tool_call_id: string };
  type TcDef = { id: string; type: "function"; function: { name: string; arguments: string } };

  const conversation: Msg[] = [
    ...(sys ? [{ role: "system" as const, content: sys }] : []),
    { role: "user" as const, content: a.prompt },
  ];

  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const payload: Record<string, unknown> = {
      model,
      stream: false,
      messages: conversation,
      ...(useTools ? { tools: TOOLS, tool_choice: "auto" } : {}),
    };

    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, message: `LM Studio HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: TcDef[];
        };
        finish_reason?: string;
      }>;
    };

    const choice = data.choices?.[0];
    const msg = choice?.message;
    const content = msg?.content?.trim() ?? "";
    const toolCalls = msg?.tool_calls ?? [];

    if (toolCalls.length === 0) {
      // LLM er færdig — brug tekst-svaret
      finalText = content;
      break;
    }

    // Tilføj assistantens tool_calls til konversationen
    conversation.push({ role: "assistant", content, tool_calls: toolCalls });

    // Eksekver tools og tilføj resultater
    for (const tc of toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try { parsedArgs = JSON.parse(tc.function.arguments); } catch { /* noop */ }
      const result = await dispatchTool(
        { id: tc.id, name: tc.function.name, arguments: parsedArgs },
        { allowDestructive: false },
      );
      conversation.push({ role: "tool", content: result.content, tool_call_id: tc.id });
    }
  }

  if (!finalText) return { ok: false, message: "tom eller ingen respons fra LLM" };

  // Push-notifikation
  const notifyResults = await notify({
    title: a.notifyTitle,
    body: finalText,
    priority: a.priority,
  });
  const okCount = notifyResults.filter((r) => r.ok).length;

  // Valgfrit: send også som iMessage
  let imessageStatus = "";
  if (a.imessageTo?.trim()) {
    const imResult = await dispatchTool(
      {
        id: `imsg_${Date.now().toString(36)}`,
        name: "send_imessage",
        arguments: { to: a.imessageTo.trim(), message: `${a.notifyTitle}\n\n${finalText}` },
      },
      { allowDestructive: false },
    );
    imessageStatus = imResult.ok ? " · iMessage sendt" : ` · iMessage fejl: ${summarize(imResult.content, 80)}`;
  }

  return {
    ok: okCount > 0 || !!a.imessageTo,
    message: `LLM gen. ${finalText.length} tegn · notify ${okCount}/${notifyResults.length}${imessageStatus}`,
  };
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

function summarize(s: string, max = 160): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? trimmed.slice(0, max) + "…" : trimmed;
}
