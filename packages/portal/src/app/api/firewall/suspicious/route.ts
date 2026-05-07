import { NextResponse, type NextRequest } from "next/server";
import { suspiciousTraffic } from "@/lib/firewall/suspicious";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CacheRow { value: string }

export async function GET() {
  try {
    const cached = getDb()
      .prepare("SELECT value FROM cache WHERE key = ? AND expires_at > ?")
      .get("firewall_suspicious_latest", Date.now()) as CacheRow | undefined;
    if (cached) return NextResponse.json(JSON.parse(cached.value));
    return NextResponse.json({
      hours: 24,
      summary: "Ingen rapport genereret endnu — POST'er for at generere.",
      generated_at: null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let hours = 24;
    try {
      const body = (await req.json()) as { hours?: number };
      if (typeof body.hours === "number") hours = Math.min(Math.max(Math.round(body.hours), 1), 168);
    } catch { /* no body — use default */ }
    const report = await suspiciousTraffic(hours);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
