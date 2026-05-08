import { NextResponse, type NextRequest } from "next/server";
import { computeAppHealth } from "@/lib/firewall/app-health";
import { getOrRefresh } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hours = Number(searchParams.get("hours") ?? "168"); // 7 dage default
    const data = await getOrRefresh(`firewall_app_health_${hours}`, 5 * 60_000, () =>
      computeAppHealth(hours)
    );
    return NextResponse.json({ apps: data, hours });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
