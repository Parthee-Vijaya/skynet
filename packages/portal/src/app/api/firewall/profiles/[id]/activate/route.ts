import { NextResponse, type NextRequest } from "next/server";
import { activateProfile } from "@/lib/firewall/profiles";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
    const result = await activateProfile(n, { reason: "manual" });
    invalidate("firewall_summary");
    invalidate("firewall_rules");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
