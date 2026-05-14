import { NextResponse } from "next/server";
import { reloadLulu } from "@/lib/firewall/lulu";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await reloadLulu();
    invalidate("firewall_lulu_status");
    invalidate("firewall_rules");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
