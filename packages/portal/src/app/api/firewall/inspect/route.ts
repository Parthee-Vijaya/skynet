import { NextResponse, type NextRequest } from "next/server";
import { inspectConnection, getInspectorHealth } from "@/lib/firewall/inspect";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(getInspectorHealth());
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const result = await inspectConnection({
      raddr: typeof body.raddr === "string" ? body.raddr : null,
      rhost: typeof body.rhost === "string" ? body.rhost : null,
      laddr: typeof body.laddr === "string" ? body.laddr : null,
      rport: typeof body.rport === "number" ? body.rport : null,
      proto: typeof body.proto === "string" ? body.proto : "tcp4",
      process: typeof body.process === "string" ? body.process : undefined,
      bundle_id: typeof body.bundle_id === "string" ? body.bundle_id : null,
      pid: typeof body.pid === "number" ? body.pid : null,
      runLLM: body.runLLM === true,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
