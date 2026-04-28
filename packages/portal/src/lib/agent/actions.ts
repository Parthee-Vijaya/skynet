/**
 * Executor for automation-actions. Kan kaldes fra scheduler-jobs, threshold-
 * checks eller "kør nu"-knappen i UI.
 */

import type { Action, LLMNotifyAction, NotifyAction, ToolAction } from "./types";
import { notify } from "../notify";
import { dispatchTool } from "./dispatcher";
import { getLLMConfig } from "../settings";
import { TOOLS } from "./tools";
import { appendLog } from "./log-buffer";

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Hvis dry-run: hvad der *ville* være sendt — én pr. step */
  dryRunPreview?: DryRunStep[];
}

export interface DryRunStep {
  type: Action["type"];
  /** Kort beskrivelse, fx "notify: 'Disk fuld' / Disken er over 90%…" */
  summary: string;
  /** Fuld payload til preview (notify-body, iMessage-tekst, tool-args mm.) */
  detail?: Record<string, unknown>;
}

export interface ActionMeta {
  automationId?: number;
  automationName?: string;
  /**
   * Dry-run: ingen notifikation/iMessage/destruktiv tool-action faktisk sendes.
   * LLM-prompten kører dog stadig (så man ser hvad der ville være sendt).
   */
  dryRun?: boolean;
}

/**
 * Kør en kæde af actions sekventielt. Stopper ved første fejl.
 * Returnerer samlet status + besked.
 */
export async function runActions(actions: Action[], meta?: ActionMeta): Promise<ActionResult> {
  if (actions.length === 0) return { ok: false, message: "ingen actions defineret" };
  if (actions.length === 1) {
    const r = await runAction(actions[0], meta);
    return r;
  }

  const msgs: string[] = [];
  const previews: DryRunStep[] = [];
  for (let i = 0; i < actions.length; i++) {
    appendLog("info", `trin ${i + 1}/${actions.length} starter (${actions[i].type})${meta?.dryRun ? " [dry-run]" : ""}`, meta);
    const r = await runAction(actions[i], meta);
    msgs.push(`[${i + 1}] ${r.message}`);
    if (r.dryRunPreview) previews.push(...r.dryRunPreview);
    if (!r.ok) {
      appendLog("warn", `trin ${i + 1}/${actions.length} fejlede — stopper kæden`, meta);
      return { ok: false, message: `trin ${i + 1}/${actions.length} fejlede: ${r.message}`, dryRunPreview: previews };
    }
    appendLog("ok", `trin ${i + 1}/${actions.length} ok`, meta);
  }
  return {
    ok: true,
    message: `${actions.length} trin fuldført · ${msgs.join(" · ")}`,
    dryRunPreview: previews.length > 0 ? previews : undefined,
  };
}

export async function runAction(action: Action, meta?: ActionMeta): Promise<ActionResult> {
  try {
    switch (action.type) {
      case "notify":
        return await runNotify(action, meta);
      case "tool":
        return await runTool(action, meta);
      case "llm_notify":
        return await runLLMNotify(action, meta);
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

async function runNotify(a: NotifyAction, meta?: ActionMeta): Promise<ActionResult> {
  if (meta?.dryRun) {
    return {
      ok: true,
      message: `[dry-run] ville sende notify "${a.title}"`,
      dryRunPreview: [{
        type: "notify",
        summary: `notify "${a.title}"`,
        detail: { title: a.title, body: a.body, priority: a.priority, tag: a.tag, url: a.url },
      }],
    };
  }
  const results = await notify({
    title: a.title,
    body: a.body,
    priority: a.priority,
    tag: a.tag,
    url: a.url,
  });
  // Per-backend log så man ser hvilken der fejlede (ikke kun X/Y-aggregatet)
  for (const r of results) {
    if (!r.ok) {
      appendLog("warn", `notify[${r.backend}] fejl: ${r.error ?? "ukendt"}`, { ...meta, tool: `notify/${r.backend}` });
    }
  }
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

async function runTool(a: ToolAction, meta?: ActionMeta): Promise<ActionResult> {
  if (meta?.dryRun) {
    return {
      ok: true,
      message: `[dry-run] ville kalde tool ${a.tool}`,
      dryRunPreview: [{
        type: "tool",
        summary: `tool ${a.tool}(${Object.keys(a.args).join(", ")})`,
        detail: { tool: a.tool, args: a.args, allowDestructive: a.allowDestructive === true },
      }],
    };
  }
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

async function runLLMNotify(a: LLMNotifyAction, meta?: ActionMeta): Promise<ActionResult> {
  const { baseUrl, apiKey, systemPrompt: defaultSys } = getLLMConfig();
  const sys = a.systemPrompt?.trim() || defaultSys;
  const model = a.model || (await pickDefaultModel(baseUrl, apiKey));
  if (!model) {
    appendLog("error", "ingen model valgt og ingen default fundet", meta);
    return { ok: false, message: "ingen model valgt og ingen default fundet" };
  }

  appendLog("info", `LLM starter · model=${model.split("/").pop() ?? model}`, meta);

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
      appendLog("tool", `→ ${tc.function.name}(${Object.keys(parsedArgs).join(", ")})`, { ...meta, tool: tc.function.name });
      const result = await dispatchTool(
        { id: tc.id, name: tc.function.name, arguments: parsedArgs },
        { allowDestructive: false },
      );
      appendLog(result.ok ? "ok" : "warn", `← ${tc.function.name}: ${summarize(result.content, 80)}`, { ...meta, tool: tc.function.name });
      conversation.push({ role: "tool", content: result.content, tool_call_id: tc.id });
    }
  }

  if (!finalText) {
    appendLog("error", "tom eller ingen respons fra LLM", meta);
    return { ok: false, message: "tom eller ingen respons fra LLM" };
  }

  // Proaktivt mønster: LLM kan skippe notifikation ved at returnere "NONE".
  // Nyttigt til automations der kun skal pinge hvis der faktisk er noget
  // at foreslå (fx "El-prisen er lav"-agent der kører hver time).
  const normalized = finalText.trim().replace(/[.!]+$/, "").toUpperCase();
  if (normalized === "NONE" || normalized.startsWith("NONE:") || normalized.startsWith("NONE ")) {
    appendLog("info", "LLM returnerede NONE · springer notifikation over", meta);
    return { ok: true, message: "LLM fandt intet værd at pinge om (NONE)" };
  }

  appendLog("info", `LLM færdig · ${finalText.length} tegn genereret`, meta);

  if (meta?.dryRun) {
    return {
      ok: true,
      message: `[dry-run] LLM gen. ${finalText.length} tegn — ingen push/iMessage sendt`,
      dryRunPreview: [{
        type: "llm_notify",
        summary: `llm_notify "${a.notifyTitle}"${a.imessageTo ? ` → iMessage ${a.imessageTo}` : ""}`,
        detail: {
          notifyTitle: a.notifyTitle,
          generatedBody: finalText,
          priority: a.priority,
          imessageTo: a.imessageTo ?? null,
        },
      }],
    };
  }

  // Push-notifikation
  const notifyResults = await notify({
    title: a.notifyTitle,
    body: finalText,
    priority: a.priority,
  });
  // Per-backend log så man kan se hvilken specifik backend der fejlede
  for (const r of notifyResults) {
    if (!r.ok) {
      appendLog("warn", `notify[${r.backend}] fejl: ${r.error ?? "ukendt"}`, { ...meta, tool: `notify/${r.backend}` });
    }
  }
  const okCount = notifyResults.filter((r) => r.ok).length;

  // Valgfrit: send også som iMessage
  let imessageStatus = "";
  if (a.imessageTo?.trim()) {
    appendLog("tool", `→ send_imessage til ${a.imessageTo}`, meta);
    const imResult = await dispatchTool(
      {
        id: `imsg_${Date.now().toString(36)}`,
        name: "send_imessage",
        arguments: { to: a.imessageTo.trim(), message: `${a.notifyTitle}\n\n${finalText}` },
      },
      { allowDestructive: false },
    );
    imessageStatus = imResult.ok ? " · iMessage sendt" : ` · iMessage fejl: ${summarize(imResult.content, 80)}`;
    appendLog(imResult.ok ? "ok" : "error", `iMessage: ${imResult.ok ? "sendt" : summarize(imResult.content, 80)}`, meta);
  }

  const finalMsg = `LLM gen. ${finalText.length} tegn · notify ${okCount}/${notifyResults.length}${imessageStatus}`;
  appendLog(okCount > 0 ? "ok" : "warn", finalMsg, meta);
  return { ok: okCount > 0 || !!a.imessageTo, message: finalMsg };
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
