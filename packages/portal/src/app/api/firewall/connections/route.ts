import { NextResponse, type NextRequest } from "next/server";
import { listConnections, getGeoMany } from "@/lib/firewall/store";
import { markDashboardActive } from "@/jobs/network-collector";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    markDashboardActive();
    const url = req.nextUrl;
    const sinceParam = url.searchParams.get("since");
    const proc = url.searchParams.get("process") ?? undefined;
    const country = url.searchParams.get("country") ?? undefined;
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
    const dedup = url.searchParams.get("dedup") !== "0";

    const sinceMs = sinceParam ? parseSince(sinceParam) : Date.now() - 60_000;

    const rows = listConnections({ sinceMs, process: proc, limit, dedup });

    // Bulk-attach geo for all unique remote IPs
    const ips = Array.from(new Set(rows.map((r) => r.raddr).filter((x): x is string => !!x)));
    const geo = getGeoMany(ips);

    let connections = rows.map((r) => {
      const g = r.raddr ? geo.get(r.raddr) : undefined;
      return {
        ...r,
        country: g?.country ?? null,
        country_code: g?.country_code ?? null,
        city: g?.city ?? null,
        isp: g?.isp ?? null,
        asn_org: g?.asn_org ?? null,
      };
    });

    if (country) {
      connections = connections.filter((c) => c.country_code === country.toUpperCase());
    }

    return NextResponse.json({ connections, count: connections.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}

function parseSince(s: string): number {
  // Accept ISO-8601, ms-epoch, or relative "now-5min" / "now-1h" / "now-24h"
  const rel = s.match(/^now-(\d+)(min|m|h)$/i);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    return Date.now() - (unit === "h" ? n * 3_600_000 : n * 60_000);
  }
  if (/^\d+$/.test(s)) return Number(s);
  const t = Date.parse(s);
  return Number.isNaN(t) ? Date.now() - 60_000 : t;
}
