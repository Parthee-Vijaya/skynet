"use client";
import { usePoll } from "@/hooks/usePoll";
import type { GithubData, GithubEventItem, GithubContribDay } from "@/lib/types";
import { Section } from "../primitives";

/**
 * GitHub personal activity widget — kompakt monospace card med:
 *   • Avatar + login + display-navn
 *   • 5 stat-tiles (today / 7d commits / streak / stars / open PRs)
 *   • 30-dages heatmap (større celler, bedre læselig)
 *   • Top 3 mest aktive repos med language-chip + star count
 *   • Color-coded event-stream m/ commit-titel-detail
 *
 * Konfigureres i /settings → "GitHub-brugernavn" (eller via GITHUB_USER env-var).
 */

// ── Heatmap ────────────────────────────────────────────────────────────────

function ContribHeatmap({ days }: { days: GithubContribDay[] }) {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.count));
  const shade = (n: number): string => {
    if (n === 0) return "#171717";
    const t = n / max;
    if (t < 0.25) return "#1e3a52";
    if (t < 0.5) return "#2e5d87";
    if (t < 0.75) return "#4285bd";
    return "#6bb6ff";
  };
  return (
    <div className="flex gap-[3px] items-end">
      {days.map((d) => {
        const dt = new Date(d.date + "T00:00:00Z");
        const isWeekStart = dt.getUTCDay() === 1; // Monday
        return (
          <div
            key={d.date}
            className="rounded-[2px]"
            style={{
              width: 9,
              height: 22,
              background: shade(d.count),
              // Subtil border-left på mandage så øjet kan se ugeskift
              borderLeft: isWeekStart ? "1px solid #2a2a2a" : "none",
              marginLeft: isWeekStart ? "1px" : "0",
            }}
            title={`${d.date}: ${d.count} contribution${d.count === 1 ? "" : "s"}`}
          />
        );
      })}
    </div>
  );
}

// ── Time helpers ──────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}t`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

// ── Event row ──────────────────────────────────────────────────────────────

/** Color-code event-typen så øjet hurtigt kan scanne stream */
function eventColor(type: string): string {
  switch (type) {
    case "PushEvent": return "text-emerald-400/80";
    case "PullRequestEvent": return "text-sky-400/80";
    case "IssuesEvent": return "text-amber-400/80";
    case "ReleaseEvent": return "text-violet-400/80";
    case "CreateEvent": return "text-teal-400/70";
    case "DeleteEvent": return "text-rose-400/70";
    case "WatchEvent":
    case "ForkEvent": return "text-neutral-400/80";
    default: return "text-neutral-500";
  }
}

function EventLine({ ev }: { ev: GithubEventItem }) {
  const repo = ev.repo.split("/")[1] ?? ev.repo;
  const colorClass = eventColor(ev.type);
  const content = (
    <div className="py-[2px]">
      <div className="flex items-baseline gap-2 text-[10px]">
        <span className={`shrink-0 font-mono ${colorClass}`}>
          {ev.action ?? ev.type}
        </span>
        <span className="text-neutral-500 truncate flex-1">{repo}</span>
        <span className="text-neutral-700 shrink-0 tabular-nums">{fmtRelative(ev.createdAt)}</span>
      </div>
      {ev.detail && (
        <div className="text-[9.5px] text-neutral-600 truncate pl-[2px] mt-[1px]">
          {ev.detail}
        </div>
      )}
    </div>
  );
  if (ev.url) {
    return (
      <a href={ev.url} target="_blank" rel="noreferrer" className="block hover:bg-neutral-900/60 px-1 -mx-1">
        {content}
      </a>
    );
  }
  return content;
}

// ── Top-repos ──────────────────────────────────────────────────────────────

/** Sprog-chip — minimal farvet bullet + sprog-navn */
function languageDot(lang: string): string {
  // Hyppigste GitHub-sprog → kort palet. Default neutral-grå.
  const map: Record<string, string> = {
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Swift: "#f05138",
    Python: "#3572a5",
    Go: "#00add8",
    Rust: "#dea584",
    Ruby: "#701516",
    Shell: "#89e051",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Java: "#b07219",
    C: "#555555",
    "C++": "#f34b7d",
    Kotlin: "#a97bff",
  };
  return map[lang] ?? "#737373";
}

function RepoLine({ repo }: { repo: GithubData["topRepos"][number] }) {
  return (
    <a
      href={repo.url}
      target="_blank"
      rel="noreferrer"
      className="block hover:bg-neutral-900/60 px-1 -mx-1 py-[2px]"
    >
      <div className="flex items-baseline gap-2 text-[10px]">
        <span className="text-neutral-300 font-mono truncate flex-1">{repo.name}</span>
        {repo.language && (
          <span className="flex items-center gap-1 shrink-0 text-[9.5px] text-neutral-500">
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: languageDot(repo.language),
              }}
            />
            {repo.language}
          </span>
        )}
        {repo.stars > 0 && (
          <span className="shrink-0 text-[9.5px] text-neutral-600 tabular-nums">★ {repo.stars}</span>
        )}
        <span className="text-neutral-700 shrink-0 tabular-nums text-[9.5px]">{fmtRelative(repo.pushedAt)}</span>
      </div>
      {repo.description && (
        <div className="text-[9.5px] text-neutral-600 truncate pl-[2px] mt-[1px]">
          {repo.description}
        </div>
      )}
    </a>
  );
}

// ── Stats tile ─────────────────────────────────────────────────────────────

function StatTile({ value, label, highlight = false }: { value: string | number; label: string; highlight?: boolean }) {
  return (
    <div>
      <div
        className={`text-[18px] font-extralight tabular-nums leading-none ${
          highlight ? "text-emerald-300" : "text-neutral-50"
        }`}
      >
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-600 mt-1">{label}</div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export function GithubWidgetMinimal() {
  const { data } = usePoll<GithubData>("/api/github", 10 * 60_000);

  const user = data?.user;
  const right = user ? (
    <span className="text-neutral-600">@{user.login}</span>
  ) : data?.error ? (
    <span className="text-rose-400/70">fejl</span>
  ) : undefined;

  return (
    <Section title="github" right={right} className="col-span-12 lg:col-span-6">
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : !user ? (
        <div className="font-mono text-[11px] text-neutral-600 space-y-1">
          <div>ingen GitHub-bruger konfigureret.</div>
          <div className="text-neutral-700">
            sæt brugernavn under{" "}
            <a href="/settings" className="text-sky-400/70 hover:text-sky-300">
              /settings
            </a>{" "}
            → GitHub-brugernavn.
          </div>
        </div>
      ) : (
        <div className="font-mono space-y-3">
          {/* Avatar + display-navn */}
          <div className="flex items-center gap-3">
            {user.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                className="w-9 h-9 rounded-full border border-neutral-800 shrink-0"
                width={36}
                height={36}
              />
            )}
            <div className="min-w-0 flex-1">
              {user.name && (
                <div className="text-[12px] text-neutral-200 truncate">{user.name}</div>
              )}
              <div className="text-[10px] text-neutral-600 truncate">
                @{user.login} · {user.publicRepos} repos · {user.followers} followers
              </div>
            </div>
          </div>

          {/* Stat-række — 5 tiles */}
          <div className="grid grid-cols-5 gap-2 pt-2 border-t border-dashed border-neutral-900">
            <StatTile value={data.commitsToday} label="i dag" highlight={data.commitsToday > 0} />
            <StatTile value={data.commitsLast7d} label="commits 7d" />
            <StatTile
              value={data.currentStreak > 0 ? `${data.currentStreak}d` : "—"}
              label="streak"
              highlight={data.currentStreak >= 7}
            />
            <StatTile value={data.starsTotal} label="stars" />
            <StatTile value={data.prsOpen} label="prs 7d" />
          </div>

          {/* 30-dages heatmap */}
          <div className="pt-2 border-t border-dashed border-neutral-900">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[9px] uppercase tracking-[0.25em] text-neutral-600">30 dages aktivitet</span>
              <span className="text-[9px] text-neutral-700 tabular-nums">
                {data.contrib.reduce((s, d) => s + d.count, 0)} total
                {data.longestStreak > 0 && (
                  <>
                    {" · "}
                    <span title={`Længste streak indenfor 30 dage: ${data.longestStreak} dage`}>
                      max {data.longestStreak}d
                    </span>
                  </>
                )}
              </span>
            </div>
            <ContribHeatmap days={data.contrib} />
          </div>

          {/* Top 3 repos */}
          {data.topRepos.length > 0 && (
            <div className="pt-2 border-t border-dashed border-neutral-900">
              <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-600 mb-1">
                top repos · senest pushed
              </div>
              <div className="space-y-[1px]">
                {data.topRepos.slice(0, 3).map((repo) => (
                  <RepoLine key={repo.name} repo={repo} />
                ))}
              </div>
            </div>
          )}

          {/* Events */}
          <div className="pt-2 border-t border-dashed border-neutral-900">
            <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-600 mb-1">seneste aktivitet</div>
            {data.events.length === 0 ? (
              <div className="text-[10px] text-neutral-600">ingen offentlig aktivitet</div>
            ) : (
              <div className="space-y-[1px] max-h-[180px] overflow-y-auto pr-1">
                {data.events.slice(0, 8).map((ev, i) => (
                  <EventLine key={`${ev.createdAt}-${i}`} ev={ev} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
