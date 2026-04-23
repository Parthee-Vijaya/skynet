import { NextRequest } from "next/server";
import { startTask, listTasks } from "@/lib/delegate/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ tasks: listTasks(50) });
}

export async function POST(req: NextRequest) {
  let body: {
    prompt?: string;
    mode?: "cli" | "terminal";
    agent?: string;
    effort?: string;
    notifyOnDone?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.prompt || !body.prompt.trim()) {
    return Response.json({ error: "prompt mangler" }, { status: 400 });
  }
  try {
    const task = startTask({
      prompt: body.prompt,
      mode: body.mode ?? "cli",
      agent: body.agent,
      effort: body.effort,
      notifyOnDone: body.notifyOnDone ?? true,
    });
    return Response.json({ ok: true, task });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
