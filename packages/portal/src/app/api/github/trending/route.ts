import { NextResponse } from "next/server";
import { getOrRefresh } from "@/lib/cache";

export const dynamic = "force-dynamic";

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
}

export interface TrendingResponse {
  repos: TrendingRepo[];
  fetchedAt: number;
  windowDays: number;
}

async function fetchTrending(): Promise<TrendingResponse> {
  // Two passes so we show a mix of brand-new repos AND actively-pushed repos
  // Both use GitHub Search API (60 req/h unauthenticated — we cache 5 min → ≤12/h)
  const now = Date.now();
  const day7 = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
  const day30 = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "SkynetDashboard/1.0",
  };

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

  const repos: TrendingRepo[] = data.items.map((item, idx) => ({
    rank: idx + 1,
    id: item.id as number,
    name: item.name as string,
    fullName: item.full_name as string,
    owner: (item.owner?.login ?? "") as string,
    description: (item.description ?? null) as string | null,
    language: (item.language ?? null) as string | null,
    stars: item.stargazers_count as number,
    forks: item.forks_count as number,
    url: item.html_url as string,
    isHot: (item.created_at as string) > `${day7}T00:00:00Z`,
    isNew: (item.created_at as string) > `${day30}T00:00:00Z`,
    createdAt: item.created_at as string,
    pushedAt: item.pushed_at as string,
  }));

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
