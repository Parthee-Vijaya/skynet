/**
 * POST /api/tools/execute — eksekvér en enkelt tool ved navn + args.
 *
 * Body: { name: string, args: Record<string, unknown>, allowDestructive?: boolean }
 * Auth: control_token bearer. Der er ingen LLM-loop her — tool kaldes direkte
 * via dispatchTool og resultatet returneres som det er.
 *
 * Bruges af packages/mcp/ stdio-bridgen (Claude Desktop / Cursor / andre
 * MCP-clients) så de kan kalde Skynet's 33+ tools uden at gå igennem en
 * LLM-loop.
 */
import { NextRequest } from "next/server";
import { dispatchTool } from "@/lib/agent/dispatcher";
import { requireAuth } from "@/lib/control/auth";
import { appendLog } from "@/lib/agent/log-buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExecuteReq {
  name?: string;
  args?: Record<string, unknown>;
  allowDestructive?: boolean;
  /** Optional client-supplied call-id for log-correlation */
  id?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const fail = requireAuth(req);
  if (fail) return fail;

  let body: ExecuteReq;
  try {
    body = (await req.json()) as ExecuteReq;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return Response.json({ ok: false, error: "name er påkrævet" }, { status: 400 });
  }
  const args = body.args ?? {};
  const allowDestructive = body.allowDestructive === true;
  const id = body.id ?? `mcp_${Date.now().toString(36)}`;

  appendLog("tool", `mcp-bridge → ${name}`, { tool: name });
  try {
    const result = await dispatchTool(
      { id, name, arguments: args },
      { allowDestructive },
    );
    return Response.json({
      ok: result.ok,
      content: result.content,
      blocked: result.blocked ?? false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendLog("error", `mcp-bridge tool fejl ${name}: ${msg.slice(0, 120)}`, { tool: name });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
