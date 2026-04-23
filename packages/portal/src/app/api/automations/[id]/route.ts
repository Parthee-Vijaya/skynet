import { NextRequest } from "next/server";
import {
  getAutomation,
  updateAutomation,
  deleteAutomation,
  listRuns,
  type UpdateAutomationInput,
} from "@/lib/agent/automations";
import { reloadScheduler } from "@/jobs/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  const a = getAutomation(n);
  if (!a) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ automation: a, runs: listRuns(n) });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  let body: UpdateAutomationInput;
  try {
    body = (await req.json()) as UpdateAutomationInput;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const updated = updateAutomation(n, body);
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  reloadScheduler();
  return Response.json({ automation: updated });
}

export async function DELETE(_: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  const ok = deleteAutomation(n);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  reloadScheduler();
  return Response.json({ ok: true });
}
