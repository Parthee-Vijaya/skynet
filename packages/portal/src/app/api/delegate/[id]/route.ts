import { NextRequest } from "next/server";
import { getTask, killTask, listArtifacts } from "@/lib/delegate/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) return Response.json({ error: "not found" }, { status: 404 });
  const artifacts = listArtifacts(id);
  return Response.json({ task, artifacts });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) return Response.json({ error: "not found" }, { status: 404 });
  const killed = killTask(id);
  return Response.json({ ok: killed, message: killed ? "stopped" : "ikke kørende" });
}
