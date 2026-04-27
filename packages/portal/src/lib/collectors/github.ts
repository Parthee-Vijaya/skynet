import type { GithubData, GithubEventItem, GithubContribDay } from "@/lib/types";
import { getSetting } from "@/lib/settings";

// GitHub REST API — ingen key krævet for public data (60 req/t ufiltreret).
// Vi rammer kun ~3 endpoints pr. 10-min refresh, så vi er langt under limit.

/** Prioritet: settings-key 'github_user' → env GITHUB_USER → tom (widget viser empty-state) */
function resolveUser(): string {
  return getSetting("github_user") || process.env.GITHUB_USER || "";
}

interface GhUser {
  login: string;
  name: string | null;
  public_repos: number;
  followers: number;
  following: number;
  avatar_url: string;
}

interface GhRepo {
  name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string;
  html_url: string;
  fork: boolean;
  archived: boolean;
}

interface GhEvent {
  id: string;
  type: string;
  repo: { name: string };
  created_at: string;
  payload: {
    action?: string;
    ref?: string;
    ref_type?: string;
    commits?: Array<{ message: string; sha: string }>;
    pull_request?: { title: string; html_url: string; state: string };
    issue?: { title: string; html_url: string };
    release?: { name: string; html_url: string };
  };
}

async function ghFetch<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "skynet-dashboard",
    "x-github-api-version": "2022-11-28",
  };
  // Auth: PAT hæver core-limit fra 60/t → 5000/t
  const token = getSetting("github_token") ?? process.env.GITHUB_TOKEN ?? "";
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(9000),
    cache: "no-store",
    headers,
  });
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status} (${url})`);
  return (await res.json()) as T;
}

function describeEvent(e: GhEvent): GithubEventItem {
  const base = {
    type: e.type,
    repo: e.repo.name,
    createdAt: e.created_at,
  };
  switch (e.type) {
    case "PushEvent": {
      const n = e.payload.commits?.length ?? 0;
      const first = e.payload.commits?.[0]?.message?.split("\n")[0];
      return {
        ...base,
        action: `pushed ${n} commit${n === 1 ? "" : "s"}`,
        detail: first,
      };
    }
    case "PullRequestEvent":
      return {
        ...base,
        action: `PR ${e.payload.action}`,
        detail: e.payload.pull_request?.title,
        url: e.payload.pull_request?.html_url,
      };
    case "IssuesEvent":
      return {
        ...base,
        action: `issue ${e.payload.action}`,
        detail: e.payload.issue?.title,
        url: e.payload.issue?.html_url,
      };
    case "ReleaseEvent":
      return {
        ...base,
        action: "release",
        detail: e.payload.release?.name ?? undefined,
        url: e.payload.release?.html_url,
      };
    case "CreateEvent":
      return {
        ...base,
        action: `oprettede ${e.payload.ref_type}`,
        detail: e.payload.ref ?? undefined,
      };
    case "WatchEvent":
      return { ...base, action: "starrede" };
    case "ForkEvent":
      return { ...base, action: "forkede" };
    case "DeleteEvent":
      return {
        ...base,
        action: `slettede ${e.payload.ref_type}`,
        detail: e.payload.ref,
      };
    default:
      return { ...base, action: e.type.replace(/Event$/, "").toLowerCase() };
  }
}

function bucketDays(events: GhEvent[], days: number): GithubContribDay[] {
  const byDate = new Map<string, number>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    byDate.set(d.toISOString().slice(0, 10), 0);
  }
  for (const e of events) {
    const key = e.created_at.slice(0, 10);
    if (byDate.has(key)) {
      let weight = 1;
      if (e.type === "PushEvent") weight = e.payload.commits?.length ?? 1;
      byDate.set(key, (byDate.get(key) ?? 0) + weight);
    }
  }
  return Array.from(byDate.entries()).map(([date, count]) => ({ date, count }));
}

export async function collect(): Promise<GithubData> {
  const USER = resolveUser();
  if (!USER) {
    return {
      user: null,
      eventsLast7d: 0,
      commitsLast7d: 0,
      prsOpen: 0,
      starsTotal: 0,
      topRepos: [],
      events: [],
      contrib: [],
      fetchedAt: new Date().toISOString(),
      error: "github_user ikke sat",
    };
  }
  try {
    const [user, repos, events] = await Promise.all([
      ghFetch<GhUser>(`https://api.github.com/users/${USER}`).catch(() => null),
      ghFetch<GhRepo[]>(
        `https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`
      ).catch(() => [] as GhRepo[]),
      ghFetch<GhEvent[]>(
        `https://api.github.com/users/${USER}/events/public?per_page=100`
      ).catch(() => [] as GhEvent[]),
    ]);

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const eventsLast7d = events.filter(
      (e) => now - new Date(e.created_at).getTime() < sevenDays
    );

    const commitsLast7d = eventsLast7d
      .filter((e) => e.type === "PushEvent")
      .reduce((sum, e) => sum + (e.payload.commits?.length ?? 0), 0);

    const prsOpen = eventsLast7d.filter(
      (e) =>
        e.type === "PullRequestEvent" && e.payload.action === "opened"
    ).length;

    const starsTotal = repos
      .filter((r) => !r.fork && !r.archived)
      .reduce((s, r) => s + r.stargazers_count, 0);

    const topRepos = repos
      .filter((r) => !r.archived)
      .sort(
        (a, b) =>
          new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime()
      )
      .slice(0, 5)
      .map((r) => ({
        name: r.name,
        description: r.description,
        stars: r.stargazers_count,
        forks: r.forks_count,
        language: r.language,
        pushedAt: r.pushed_at,
        url: r.html_url,
      }));

    const evItems = events
      .slice(0, 12)
      .map(describeEvent);

    const contrib = bucketDays(events, 30);

    return {
      user: user
        ? {
            login: user.login,
            name: user.name,
            publicRepos: user.public_repos,
            followers: user.followers,
            following: user.following,
            avatarUrl: user.avatar_url,
          }
        : null,
      eventsLast7d: eventsLast7d.length,
      commitsLast7d,
      prsOpen,
      starsTotal,
      topRepos,
      events: evItems,
      contrib,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      user: null,
      eventsLast7d: 0,
      commitsLast7d: 0,
      prsOpen: 0,
      starsTotal: 0,
      topRepos: [],
      events: [],
      contrib: [],
      fetchedAt: new Date().toISOString(),
      error: (err as Error).message,
    };
  }
}
