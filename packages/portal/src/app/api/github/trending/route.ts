import { NextResponse } from "next/server";
import { getOrRefresh } from "@/lib/cache";
import { getSetting, getSettingJSON, setSettingJSON } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface TrendingRepo {
  rank: number;
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  url: string;
  /** Created within last 7 days */
  isHot: boolean;
  /** Created within last 30 days */
  isNew: boolean;
  createdAt: string;
  pushedAt: string;
  /** Stars gained since start of day (UTC). Null if not enough data. */
  starsToday: number | null;
}

export interface TrendingResponse {
  repos: TrendingRepo[];
  fetchedAt: number;
  windowDays: number;
}

/** Baseline: store star counts at the start of each UTC day */
function getDayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getStarBaseline(): Record<number, number> {
  return getSettingJSON<Record<number, number>>(`github_star_baseline_${getDayKey()}`, {});
}

function setStarBaseline(baseline: Record<number, number>): void {
  setSettingJSON(`github_star_baseline_${getDayKey()}`, baseline);
}

async function fetchTrending(): Promise<TrendingResponse> {
  const now = Date.now();
  const day7 = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
  const day30 = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "SkynetDashboard/1.0",
  };

  // Auth: PAT hæver rate-limit fra 10/min (anonym) → 30/min (auth)
  const token = getSetting("github_token") ?? process.env.GITHUB_TOKEN ?? "";
  if (token) headers.Authorization = `Bearer ${token}`;

  // Primary: repos created in last 7 days, sorted by stars (= "new gems" à la starquake)
  const q = encodeURIComponent(`created:>${day7}`);
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=25`;

  const res = await fetch(url, {
    headers,
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    throw new Error(`GitHub Search API ${res.status}: ${await res.text().then(t => t.slice(0, 120))}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as { items: any[] };

  // GitHub returnerer 200 med tom items[] når Search API er rate-limited
  // (kender det fra anonymous-tier 10/min). Behandl det som en fejl så vi ikke
  // cacher tomheden i 5 min — næste request kan så lykkes.
  if (data.items.length === 0) {
    throw new Error("GitHub Search returnerede 0 — sandsynligvis rate-limit (anonym 10/min)");
  }

  // Load (or create) today's star baseline
  let baseline = getStarBaseline();
  const isFirstFetch = Object.keys(baseline).length === 0;

  const repos: TrendingRepo[] = data.items.map((item, idx) => {
    const id = item.id as number;
    const stars = item.stargazers_count as number;
    const baselineStars = baseline[id];
    const starsToday = baselineStars !== undefined ? Math.max(0, stars - baselineStars) : null;
    return {
      rank: idx + 1,
      id,
      name: item.name as string,
      fullName: item.full_name as string,
      owner: (item.owner?.login ?? "") as string,
      description: (item.description ?? null) as string | null,
      language: (item.language ?? null) as string | null,
      stars,
      forks: item.forks_count as number,
      url: item.html_url as string,
      isHot: (item.created_at as string) > `${day7}T00:00:00Z`,
      isNew: (item.created_at as string) > `${day30}T00:00:00Z`,
      createdAt: item.created_at as string,
      pushedAt: item.pushed_at as string,
      starsToday,
    };
  });

  // First fetch of the day: set baseline from current data
  if (isFirstFetch) {
    baseline = {};
    for (const repo of repos) baseline[repo.id] = repo.stars;
    setStarBaseline(baseline);
  }

  return { repos, fetchedAt: now, windowDays: 7 };
}

export async function GET() {
  try {
    const data = await getOrRefresh<TrendingResponse>("github-trending", 5 * 60_000, fetchTrending);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown", repos: [], fetchedAt: 0, windowDays: 7 },
      { status: 500 }
    );
  }
}
