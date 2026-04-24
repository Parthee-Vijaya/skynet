/**
 * /api/agent-events — webhook for brrr og andre agent-notif-kilder.
 *
 * Modtager POST med event-data (idle/finished/error/waiting), skriver til
 * agent-log-panelet i /automations, og pusher ntfy-notifikation til iPhone.
 *
 * Auth:
 *   - brrr POSTer til denne endpoint med Authorization: Bearer <control_token>
 *   - Same-origin requests (Skynet's egen browser) tillades uden token
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/control/auth";
import { appendLog } from "@/lib/agent/log-buffer";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** brrr-webhook payload-format (så vidt vi ved — doc er sparsom) */
interface AgentEventBody {
  /** fx "claude", "codex" */
  agent?: string;
  /** fx "agents:0" */
  session?: string;
  /** "idle" | "finished" | "error" | "waiting" */
  event?: string;
  /** Sekunder siden sidste aktivitet */
  idle_seconds?: number;
  /** Fri tekst */
  message?: string;
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
  return "default"; // idle default — brugeren kan selv juste
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
  const msg = body.message ?? `${agent} er ${event}`;
  const idleText = body.idle_seconds ? ` (${body.idle_seconds}s)` : "";

  // Log til agent-log-panelet i /automations (eksisterende infra)
  appendLog(
    event === "error" ? "error" : event === "finished" ? "ok" : "warn",
    `agent '${agent}' · ${event}${idleText} · ${msg}`.slice(0, 300),
    { automationName: session, tool: "agent-event" },
  );

  // Push-notifikation via eksisterende notify()-multi-backend
  // URL linker til terminal-siden så brugeren kan reagere direkte
  const terminalUrl = `/terminal?session=${encodeURIComponent(session.split(":")[0] ?? "agents")}`;
  const notifyResults = await notify({
    title: `${emojiForEvent(event)} ${agent} · ${event}`,
    body: msg.length > 180 ? msg.slice(0, 177) + "…" : msg,
    priority: priorityForEvent(event),
    tag: event,
    url: terminalUrl,
  });

  const okCount = notifyResults.filter((r) => r.ok).length;

  return NextResponse.json({
    ok: true,
    notified: okCount,
    backends: notifyResults.map((r) => ({ backend: r.backend, ok: r.ok, error: r.error })),
  });
}

/** GET: minimal health-check + instruktion til brrr-konfig */
export async function GET(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return NextResponse.json({
    ok: true,
    hint: "Send agent-events som POST med JSON-body: { agent, session, event, idle_seconds?, message? }",
    brrr_example: "brrr agent install all --webhook http://<mac-ip>:3100/api/agent-events --idle-seconds 20",
  });
}
