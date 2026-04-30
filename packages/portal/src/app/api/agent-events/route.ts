/**
 * /api/agent-events — webhook for Claude Code Stop-hook + brrr og andre
 * agent-notif-kilder.
 *
 * Modtager POST med event-data og:
 *   1. Logger til agent-log-panelet i /automations
 *   2. Hvis sessionId+cwd: læser session-JSONL → bygger detaljeret body
 *      med last user-prompt + last assistant-svar + tools + varighed
 *   3. Sender push via notify() med ntfy action-buttons:
 *        [→ Fortsæt] view-action der åbner /continue/<id>
 *        [📜 Transcript] view-action der åbner JSONL-viewer
 *   4. Hvis Telegram er konfigureret + chat_id allowlistet: send også
 *      detaljen til Telegram-botten med inline-knap til reply
 *
 * Auth:
 *   - Bearer <control_token> for cross-origin
 *   - Same-origin requests tillades uden token
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/control/auth";
import { appendLog } from "@/lib/agent/log-buffer";
import { notify, type NtfyAction } from "@/lib/notify";
import { getSessionSummary, formatSummaryForPush, type SessionSummary } from "@/lib/integrations/claude-sessions";
import { getTelegramAllowedChatIds, getTelegramBotToken, setSetting } from "@/lib/settings";
import { sendMessage as sendTelegramMessage } from "@/lib/integrations/telegram";
import { truncate } from "@/lib/formatters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgentEventBody {
  agent?: string;
  session?: string;
  event?: string;
  idle_seconds?: number;
  message?: string;
  /** Claude Code Stop-hook: session UUID fra stdin envelope */
  sessionId?: string;
  /** Working directory hvor Claude Code kørte (hjælper finde JSONL) */
  cwd?: string;
  /** Sti til transcript-JSONL — hvis Claude Code sender det direkte */
  transcriptPath?: string;
}

function emojiForEvent(event?: string): string {
  switch (event) {
    case "idle": return "⏸";
    case "finished": return "✅";
    case "error": return "⚠️";
    case "waiting": return "💬";
    default: return "🤖";
  }
}

function priorityForEvent(event?: string): "low" | "default" | "high" {
  if (event === "error" || event === "waiting") return "high";
  if (event === "finished") return "default";
  return "default";
}

function tagForEvent(event?: string): string {
  switch (event) {
    case "idle": return "hourglass_flowing_sand";
    case "finished": return "white_check_mark";
    case "error": return "warning";
    case "waiting": return "speech_balloon";
    default: return "robot_face";
  }
}

export async function POST(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;

  let body: AgentEventBody = {};
  try {
    body = await req.json() as AgentEventBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const agent = body.agent ?? "agent";
  const session = body.session ?? "agents";
  const event = body.event ?? "idle";
  const fallbackMsg = body.message ?? `${agent} er ${event}`;
  const idleText = body.idle_seconds ? ` (${body.idle_seconds}s)` : "";

  // 1) Hvis Stop-hook har sendt sessionId: læs JSONL for rig opsummering
  let summary: SessionSummary | null = null;
  if (body.sessionId) {
    try {
      summary = await getSessionSummary(body.sessionId, body.cwd);
    } catch {
      summary = null;
    }
  }

  // Track sidste finished session så ntfy-subscriber + Telegram-reply
  // ved hvilken session der skal genstartes når brugeren svarer
  if (event === "finished" && body.sessionId) {
    setSetting("last_finished_session_id", body.sessionId);
    if (body.cwd) setSetting("last_finished_session_cwd", body.cwd);
    setSetting("last_finished_session_at", String(Date.now()));
  }

  // 2) Log til agent-log-panel
  const logMsg = summary
    ? `agent '${agent}' · ${event} · ${summary.project ?? "?"} · ${summary.messageCount} msg`
    : `agent '${agent}' · ${event}${idleText} · ${fallbackMsg}`;
  appendLog(
    event === "error" ? "error" : event === "finished" ? "ok" : "warn",
    logMsg.slice(0, 300),
    { automationName: session, tool: "agent-event" },
  );

  // 3) Build push-titel og body
  let pushTitle: string;
  let pushBody: string;
  if (summary && event === "finished") {
    const f = formatSummaryForPush(summary);
    pushTitle = f.title;
    pushBody = f.body;
  } else {
    pushTitle = `${emojiForEvent(event)} ${agent} · ${event}`;
    pushBody = fallbackMsg.length > 360 ? fallbackMsg.slice(0, 357) + "…" : fallbackMsg;
  }

  // 4) Action-buttons (kun ved finished + sessionId)
  const actions: NtfyAction[] = [];
  if (event === "finished" && body.sessionId) {
    const continueUrl = `/continue/${encodeURIComponent(body.sessionId)}${body.cwd ? `?cwd=${encodeURIComponent(body.cwd)}` : ""}`;
    actions.push({ type: "view", label: "→ Fortsæt", url: continueUrl, clear: true });
    actions.push({ type: "view", label: "📜 Transcript", url: continueUrl + (continueUrl.includes("?") ? "&" : "?") + "view=transcript" });
  }

  // 5) Klik-URL (forskellig fra actions — bruges til hele notif'en på iOS).
  // Hvis vi har sessionId: åbn reply-form. Ellers fallback til /agents-siden
  // (Paseo) så brugeren kan se igangværende agents.
  const clickUrl = body.sessionId
    ? `/continue/${encodeURIComponent(body.sessionId)}${body.cwd ? `?cwd=${encodeURIComponent(body.cwd)}` : ""}`
    : "/agents";

  const notifyResults = await notify({
    title: pushTitle,
    body: pushBody,
    priority: priorityForEvent(event),
    tag: tagForEvent(event),
    url: clickUrl,
    actions: actions.length > 0 ? actions : undefined,
  });

  // 6) Telegram-bridge: hvis konfigureret, send også til allowlistede chats
  // (tillader 2-vejs reply via Telegram bot — LLM kan kalde
  // continue_claude_session-tool når brugeren svarer)
  await maybeBridgeToTelegram({ title: pushTitle, body: pushBody, summary, sessionId: body.sessionId });

  const okCount = notifyResults.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    notified: okCount,
    backends: notifyResults.map((r) => ({ backend: r.backend, ok: r.ok, error: r.error })),
    summaryFound: !!summary,
  });
}

async function maybeBridgeToTelegram(opts: {
  title: string;
  body: string;
  summary: SessionSummary | null;
  sessionId?: string;
}): Promise<void> {
  if (!getTelegramBotToken()) return;
  const allowed = getTelegramAllowedChatIds();
  if (allowed.length === 0) return;

  // Brug Telegram-markdown til at gøre svaret pænere
  const lines: string[] = [];
  lines.push(`*${escapeMd(opts.title)}*`);
  lines.push("");
  if (opts.summary) {
    if (opts.summary.lastUserMessage) {
      lines.push(`👤 _Du:_ ${escapeMd(truncate(opts.summary.lastUserMessage, 240))}`);
    }
    if (opts.summary.lastAssistantMessage) {
      lines.push(`🤖 _Claude:_ ${escapeMd(truncate(opts.summary.lastAssistantMessage, 360))}`);
    }
    lines.push("");
    lines.push(`_${opts.summary.messageCount} msg · ${opts.summary.toolsUsed.length} tools_`);
  } else {
    lines.push(escapeMd(opts.body));
  }
  if (opts.sessionId) {
    lines.push("");
    lines.push(`💬 _Skriv svar her for at fortsætte sessionen_ \`(id: ${opts.sessionId.slice(0, 8)}…)\``);
  }
  const text = lines.join("\n");

  for (const chatId of allowed) {
    const id = parseInt(chatId, 10);
    if (!Number.isFinite(id)) continue;
    try {
      await sendTelegramMessage({ chatId: id, text, parseMode: "Markdown" });
    } catch {
      /* fail silent — push via ntfy/macos er stadig sendt */
    }
  }
}

function escapeMd(s: string): string {
  // Telegram Markdown v1: escape `_*[`
  return s.replace(/([_*[\]`])/g, "\\$1");
}

export async function GET(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return NextResponse.json({
    ok: true,
    hint: "POST { agent, session, event, sessionId?, cwd?, message? } — sessionId+cwd giver detaljeret notif fra JSONL",
    examples: {
      claude_stop_hook: "{ agent: 'claude-code', event: 'finished', sessionId: '<uuid>', cwd: '/Users/x/repo' }",
      brrr: "brrr agent install all --webhook http://<mac-ip>:3100/api/agent-events --idle-seconds 20",
    },
  });
}
