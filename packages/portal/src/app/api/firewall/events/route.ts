import { NextResponse, type NextRequest } from "next/server";
import { listEvents } from "@/lib/firewall/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const sinceParam = url.searchParams.get("since");
    const kind = url.searchParams.get("kind") ?? undefined;
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
    const unackedOnly = url.searchParams.get("unackedOnly") === "1";

    const sinceMs = sinceParam ? parseSince(sinceParam) : Date.now() - 24 * 3_600_000;
    const events = listEvents({ sinceMs, kind, limit, unackedOnly });

    // Parse JSON detail-fields server-side so the client doesn't need to.
    const enriched = events.map((e) => ({
      ...e,
      detail: e.detail ? safeJson(e.detail) : null,
    }));

    return NextResponse.json({ events: enriched, count: enriched.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function parseSince(s: string): number {
  const rel = s.match(/^now-(\d+)(min|m|h|d)$/i);
  if (rel) {
    const n = Number(rel[1]);
    const u = rel[2].toLowerCase();
    if (u === "d") return Date.now() - n * 86_400_000;
    if (u === "h") return Date.now() - n * 3_600_000;
    return Date.now() - n * 60_000;
  }
  if (/^\d+$/.test(s)) return Number(s);
  const t = Date.parse(s);
  return Number.isNaN(t) ? Date.now() - 24 * 3_600_000 : t;
}
