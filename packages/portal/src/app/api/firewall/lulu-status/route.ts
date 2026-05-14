import { NextResponse } from "next/server";
import { getOrRefresh } from "@/lib/cache";
import { detectLulu } from "@/lib/firewall/lulu";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getOrRefresh("firewall_lulu_status", 30_000, detectLulu);
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
