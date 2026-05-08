import { NextResponse, type NextRequest } from "next/server";
import { lookupMany } from "@/lib/firewall/geo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const ips = url.searchParams.getAll("ip").slice(0, 100);
    if (ips.length === 0) {
      return NextResponse.json({ geo: {} });
    }
    const map = await lookupMany(ips);
    const geo: Record<string, unknown> = {};
    for (const [ip, row] of map) {
      geo[ip] = {
        country: row.country,
        country_code: row.country_code,
        region: row.region,
        city: row.city,
        lat: row.lat,
        lng: row.lng,
        isp: row.isp,
        asn: row.asn,
        asn_org: row.asn_org,
      };
    }
    return NextResponse.json({ geo, count: Object.keys(geo).length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
