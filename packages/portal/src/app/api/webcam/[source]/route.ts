import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Whitelist of allowed webcam sources — mapped to public JPG URLs.
// Storebaelt.dk-billederne er ikke rigtigt live (opdateres sjældent), så vi
// bruger i stedet livetraffic.eu's feeds fra Sund & Bælt der opdateres cirka
// hvert minut. Dækker broerne nær Sjælland/Øresund.
const SOURCES: Record<string, string> = {
  "oresund-ost": "https://livetraffic.eu/wp-content/uploads/webcams/oresundsbron-east.jpg",
  "oresund-vest": "https://livetraffic.eu/wp-content/uploads/webcams/oresundsbron-west.jpg",
  // Storebælts egen webcam — opdateres sjældent, men bevaret som fallback
  "storebaelt-bro":
    "https://storebaelt.dk/media/ctjpgsqu/webcambro.jpg?width=974&height=700&quality=75",
  "storebaelt-sprogo":
    "https://storebaelt.dk/media/eyyfkvbn/webcamsprogoe.jpg?width=974&height=700&quality=75",
};

// Referer til at passe soft-checks på upstream-serveren.
const REFERERS: Record<string, string> = {
  "oresund-ost": "https://livetraffic.eu/denmark/",
  "oresund-vest": "https://livetraffic.eu/denmark/",
  "storebaelt-bro": "https://storebaelt.dk/",
  "storebaelt-sprogo": "https://storebaelt.dk/",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ source: string }> }
) {
  const { source } = await params;
  const upstream = SOURCES[source];
  if (!upstream) {
    return NextResponse.json({ error: "unknown source" }, { status: 404 });
  }

  try {
    // Append cache-buster så vi altid får et frisk frame.
    const sep = upstream.includes("?") ? "&" : "?";
    const url = `${upstream}${sep}_=${Date.now()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        // Nogle upstream-servere tjekker Referer — send deres egen origin.
        Referer: REFERERS[source] ?? "https://storebaelt.dk/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream ${res.status}` },
        { status: 502 }
      );
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    );
  }
}
