import { NextRequest, NextResponse } from "next/server";
import * as sonarr from "@/lib/collectors/sonarr";
import * as radarr from "@/lib/collectors/radarr";
import { invalidate } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AddBody {
  type: "tv" | "movie";
  externalId: number; // tvdbId | tmdbId
  title?: string;
  year?: number;
}

export async function POST(req: NextRequest) {
  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.type || !body?.externalId) {
    return NextResponse.json(
      { ok: false, error: "Mangler type eller externalId" },
      { status: 400 }
    );
  }

  if (body.type === "tv") {
    // Brug lookup til at få fuldt candidate-objekt (Sonarr kræver images osv.)
    const term = body.title ?? "";
    const candidates = term
      ? await sonarr.lookupSeries(term)
      : await sonarr.lookupSeries(`tvdb:${body.externalId}`);
    const candidate = candidates.find((c) => c.tvdbId === body.externalId) ?? candidates[0];
    if (!candidate) {
      return NextResponse.json(
        { ok: false, error: "Kunne ikke finde serien i Sonarr-lookup" },
        { status: 404 }
      );
    }
    const result = await sonarr.addSeries(candidate, {
      monitor: "all",
      searchForMissingEpisodes: true,
    });
    if (result.ok) invalidate("watchlist");
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  if (body.type === "movie") {
    const term = body.title ?? "";
    const candidates = term
      ? await radarr.lookupMovie(term)
      : await radarr.lookupMovie(`tmdb:${body.externalId}`);
    const candidate = candidates.find((c) => c.tmdbId === body.externalId) ?? candidates[0];
    if (!candidate) {
      return NextResponse.json(
        { ok: false, error: "Kunne ikke finde filmen i Radarr-lookup" },
        { status: 404 }
      );
    }
    const result = await radarr.addMovie(candidate, {
      searchForMovie: true,
      monitored: true,
    });
    if (result.ok) invalidate("watchlist");
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  return NextResponse.json({ ok: false, error: "Ukendt type" }, { status: 400 });
}
