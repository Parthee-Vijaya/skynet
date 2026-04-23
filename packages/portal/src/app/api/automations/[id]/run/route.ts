import { NextRequest } from "next/server";
import { runAutomationManually } from "@/jobs/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isFinite(n)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const result = await runAutomationManually(n);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
