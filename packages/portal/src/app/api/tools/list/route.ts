/**
 * GET /api/tools/list — eksponer TOOLS-arrayet til MCP-bridgen.
 *
 * Returnerer hele OpenAI-format-listen så MCP-serveren kan registrere dem
 * 1:1 i sin egen ListTools-handler. Auth: control_token bearer (samme
 * pattern som /api/control/*).
 */
import { NextRequest } from "next/server";
import { TOOLS } from "@/lib/agent/tools";
import { requireAuth } from "@/lib/control/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const fail = requireAuth(req);
  if (fail) return fail;
  return Response.json({ tools: TOOLS });
}
