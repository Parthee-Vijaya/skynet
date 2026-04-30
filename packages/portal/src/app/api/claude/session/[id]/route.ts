/**
 * GET /api/claude/session/[id]?cwd=... — returnerer session-summary fra
 * JSONL: last user, last assistant, tools, varighed, antal messages.
 *
 * Bruges af /continue/[sessionId]-siden til at vise context før reply.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionSummary } from "@/lib/integrations/claude-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const sessionId = id.trim();
  const cwd = req.nextUrl.searchParams.get("cwd") ?? undefined;

  if (!/^[0-9a-fA-F-]{8,64}$/.test(sessionId)) {
    return NextResponse.json({ ok: false, error: "ugyldig sessionId" }, { status: 400 });
  }

  const summary = await getSessionSummary(sessionId, cwd);
  if (!summary) {
    return NextResponse.json({
      ok: false,
      error: "session ikke fundet — JSONL findes ikke i ~/.claude/projects/",
      sessionId,
    }, { status: 404 });
  }

  return NextResponse.json({ ok: true, summary });
}
