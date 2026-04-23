import { NextResponse } from "next/server";
import { daemonRequest, isDaemonOnline } from "@/lib/daemon-client";

/**
 * GET /api/daemon/agents — list all agents from daemon.
 */
export async function GET() {
  const online = await isDaemonOnline();
  if (!online) {
    return NextResponse.json({ online: false, agents: [] });
  }

  try {
    const res = await daemonRequest<{ type: string; agents?: unknown[] }>({
      type: "fetch_agents_request",
    });
    return NextResponse.json({
      online: true,
      agents: res.agents ?? [],
    });
  } catch {
    return NextResponse.json({ online: true, agents: [], error: "Failed to fetch agents" });
  }
}

/**
 * POST /api/daemon/agents — create a new agent.
 * Body: { prompt: string, provider?: string, model?: string, directory?: string }
 */
export async function POST(request: Request) {
  const online = await isDaemonOnline();
  if (!online) {
    return NextResponse.json({ error: "Daemon offline" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const res = await daemonRequest({
      type: "create_agent_request",
      prompt: body.prompt,
      provider: body.provider,
      model: body.model,
      directory: body.directory,
    }, 15000);
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create agent" },
      { status: 500 },
    );
  }
}
