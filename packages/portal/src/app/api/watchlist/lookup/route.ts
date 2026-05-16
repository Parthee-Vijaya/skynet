import { NextRequest, NextResponse } from "next/server";
import * as sonarr from "@/lib/collectors/sonarr";
import * as radarr from "@/lib/collectors/radarr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LookupHit {
  service: "sonarr" | "radarr";
  type: "tv" | "movie";
  title: string;
  year?: number;
  externalId: number;
  imdbId?: string;
  poster?: string;
  overview?: string;
  alreadyAdded: boolean;
  serviceId?: number; // hvis allerede tilføjet
  network?: string;
  runtime?: number;
  status?: string;
}

function pickPoster(images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>): string | undefined {
  const poster = images?.find((i) => i.coverType === "poster");
  return poster?.remoteUrl || poster?.url;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const type = url.searchParams.get("type"); // "tv" | "movie" | null (begge)

  if (q.length < 2) {
    return NextResponse.json({ hits: [] });
  }

  const wantTv = !type || type === "tv";
  const wantMovie = !type || type === "movie";

  const [sLookup, rLookup, existingSeries, existingMovies] = await Promise.all([
    wantTv ? sonarr.lookupSeries(q) : Promise.resolve([]),
    wantMovie ? radarr.lookupMovie(q) : Promise.resolve([]),
    wantTv ? sonarr.listSeries() : Promise.resolve([]),
    wantMovie ? radarr.listMovies() : Promise.resolve([]),
  ]);

  const existingTvdbIds = new Map(existingSeries.map((s) => [s.tvdbId ?? 0, s.id]));
  const existingTmdbIds = new Map(existingMovies.map((m) => [m.tmdbId ?? 0, m.id]));

  const hits: LookupHit[] = [];

  for (const s of sLookup) {
    if (!s.tvdbId) continue;
    const serviceId = existingTvdbIds.get(s.tvdbId);
    hits.push({
      service: "sonarr",
      type: "tv",
      title: s.title,
      year: s.year,
      externalId: s.tvdbId,
      imdbId: s.imdbId,
      poster: pickPoster(s.images),
      overview: s.overview,
      alreadyAdded: serviceId !== undefined,
      serviceId,
      network: s.network,
      runtime: s.runtime,
      status: s.status,
    });
  }

  for (const m of rLookup) {
    if (!m.tmdbId) continue;
    const serviceId = existingTmdbIds.get(m.tmdbId);
    hits.push({
      service: "radarr",
      type: "movie",
      title: m.title,
      year: m.year,
      externalId: m.tmdbId,
      imdbId: m.imdbId,
      poster: pickPoster(m.images),
      overview: m.overview,
      alreadyAdded: serviceId !== undefined,
      serviceId,
      runtime: m.runtime,
      status: m.status,
    });
  }

  // Begræns til de bedste 20 — Sonarr/Radarr giver typisk 5-20 hits
  hits.splice(20);

  return NextResponse.json({ hits });
}
