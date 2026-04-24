"use client";
import { usePoll } from "@/hooks/usePoll";
import type { GithubData, GithubEventItem, GithubContribDay } from "@/lib/types";
import { Section } from "../primitives";

/**
 * GitHub personal activity widget — stats, 30-dages heatmap, seneste events.
 * Kræver GITHUB_USER env-var for at vise data (ellers empty-state).
 */

function ContribHeatmap({ days }: { days: GithubContribDay[] }) {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.count));
  const shade = (n: number): string => {
    if (n === 0) return "#1a1a1a";
    const t = n / max;
    if (t < 0.25) return "#1e3a52";
    if (t < 0.5) return "#2e5d87";
    if (t < 0.75) return "#4285bd";
    return "#6bb6ff";
  };
  return (
    <div className="flex gap-[2px] items-end">
      {days.map((d) => (
        <div
          key={d.date}
          className="rounded-[1px]"
          style={{ width: 8, height: 16, background: shade(d.count) }}
          title={`${d.date}: ${d.count}`}
        />
      ))}
    </div>
  );
}

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

function EventLine({ ev }: { ev: GithubEventItem }) {
  const repo = ev.repo.split("/")[1] ?? ev.repo;
  const content = (
    <div className="flex items-baseline gap-2 text-[10px] py-[2px]">
      <span className="text-sky-400/70 shrink-0 font-mono">
        {ev.action ?? ev.type}
      </span>
      <span className="text-neutral-500 truncate flex-1">{repo}</span>
      <span className="text-neutral-700 shrink-0 tabular-nums">{fmtRelative(ev.createdAt)}</span>
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

export function GithubWidgetMinimal() {
  const { data } = usePoll<GithubData>("/api/github", 10 * 60_000);

  const user = data?.user;
  const right = user
    ? <span className="text-neutral-600">@{user.login}</span>
    : data?.error
      ? <span className="text-rose-400/70">fejl</span>
      : undefined;

  return (
    <Section title="github" right={right} className="col-span-12 lg:col-span-6">
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : !user ? (
        <div className="font-mono text-[11px] text-neutral-600 space-y-1">
          <div>ingen GitHub-bruger konfigureret.</div>
          <div className="text-neutral-700">
            sæt <code className="text-neutral-500">GITHUB_USER</code> env-var i din LaunchAgent-plist
            eller <code className="text-neutral-500">~/.zshrc</code> og genstart portal.
          </div>
        </div>
      ) : (
        <div className="font-mono space-y-3">
          {/* Stat-række */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <div className="text-[18px] font-extralight text-neutral-50 tabular-nums leading-none">{user.publicRepos}</div>
              <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-600 mt-1">repos</div>
            </div>
            <div>
              <div className="text-[18px] font-extralight text-neutral-50 tabular-nums leading-none">{data.starsTotal}</div>
              <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-600 mt-1">stars</div>
            </div>
            <div>
              <div className="text-[18px] font-extralight text-neutral-50 tabular-nums leading-none">{data.commitsLast7d}</div>
              <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-600 mt-1">commits 7d</div>
            </div>
            <div>
              <div className="text-[18px] font-extralight text-neutral-50 tabular-nums leading-none">{data.eventsLast7d}</div>
              <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-600 mt-1">events 7d</div>
            </div>
          </div>

          {/* 30-dages heatmap */}
          <div className="pt-2 border-t border-dashed border-neutral-900">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[9px] uppercase tracking-[0.25em] text-neutral-600">30 dages aktivitet</span>
              <span className="text-[9px] text-neutral-700 tabular-nums">
                {data.contrib.reduce((s, d) => s + d.count, 0)} i alt
              </span>
            </div>
            <ContribHeatmap days={data.contrib} />
          </div>

          {/* Events */}
          <div className="pt-2 border-t border-dashed border-neutral-900">
            <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-600 mb-1">seneste aktivitet</div>
            {data.events.length === 0 ? (
              <div className="text-[10px] text-neutral-600">ingen offentlig aktivitet</div>
            ) : (
              <div className="space-y-[1px] max-h-[140px] overflow-y-auto pr-1">
                {data.events.slice(0, 6).map((ev, i) => (
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
