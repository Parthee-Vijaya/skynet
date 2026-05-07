import { NextResponse, type NextRequest } from "next/server";
import { getOrRefresh } from "@/lib/cache";
import { trafficHistory, type HistoryBucket } from "@/lib/firewall/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const hours = Math.min(Math.max(Number(url.searchParams.get("hours") ?? "24"), 1), 168);
    const bucketMin = Math.min(Math.max(Number(url.searchParams.get("bucketMin") ?? "5"), 1), 60);

    const cacheKey = `firewall_history_${hours}h_${bucketMin}m`;
    const data = await getOrRefresh<HistoryBucket[]>(cacheKey, 30_000, async () =>
      trafficHistory(hours * 3_600_000, bucketMin * 60_000)
    );
    return NextResponse.json({ buckets: data, hours, bucketMin });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
