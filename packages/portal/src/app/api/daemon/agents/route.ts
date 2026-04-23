import { NextResponse } from "next/server";
import { daemonRequest, isDaemonOnline } from "@/lib/daemon-client";

interface AgentSnapshot {
  id: string;
  status: string;
  provider: string;
  model: string | null;
  cwd: string;
  title: string | null;
  createdAt: string;
}

interface FetchAgentsResponse {
  type: "fetch_agents_response";
  payload: {
    requestId: string;
    entries: Array<{ agent: AgentSnapshot }>;
    pageInfo: { nextCursor: string | null; hasMore: boolean };
  };
}

/**
 * GET /api/daemon/agents — list all agents from daemon.
 */
export async function GET() {
  const online = await isDaemonOnline();
  if (!online) {
    return NextResponse.json({ online: false, agents: [] });
  }

  try {
    const res = await daemonRequest<FetchAgentsResponse>({
      type: "fetch_agents_request",
      page: { limit: 50 },
    });

    const agents = (res.payload?.entries ?? []).map((entry) => ({
      id: entry.agent.id,
      status: entry.agent.status,
      provider: entry.agent.provider,
      model: entry.agent.model ?? undefined,
      directory: entry.agent.cwd,
      prompt: entry.agent.title ?? undefined,
      createdAt: entry.agent.createdAt,
    }));

    return NextResponse.json({ online: true, agents });
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
    const res = await daemonRequest(
      {
        type: "create_agent_request",
        prompt: body.prompt,
        provider: body.provider,
        model: body.model,
        cwd: body.directory,
      },
      15000,
    );
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create agent" },
      { status: 500 },
    );
  }
}
