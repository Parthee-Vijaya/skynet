import { NextResponse, type NextRequest } from "next/server";
import { ackEvent } from "@/lib/firewall/store";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    ackEvent(n);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
