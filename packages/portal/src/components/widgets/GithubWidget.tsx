"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/formatters";
import type { GithubData, GithubEventItem, GithubContribDay } from "@/lib/types";

function ContribHeatmap({ days }: { days: GithubContribDay[] }) {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.count));
  const shade = (n: number): string => {
    if (n === 0) return "bg-neutral-800/60";
    const t = n / max;
    if (t < 0.25) return "bg-[var(--j-acc,_#00d9ff)]/20";
    if (t < 0.5) return "bg-[var(--j-acc,_#00d9ff)]/40";
    if (t < 0.75) return "bg-[var(--j-acc,_#00d9ff)]/65";
    return "bg-[var(--j-acc,_#00d9ff)]/90";
  };
  return (
    <div className="flex gap-[3px] items-end">
      {days.map((d) => (
        <div
          key={d.date}
          className={`w-2.5 h-5 rounded-sm ${shade(d.count)}`}
          title={`${d.date}: ${d.count} aktivitet`}
        />
      ))}
    </div>
  );
}

function EventRow({ ev }: { ev: GithubEventItem }) {
  const content = (
    <div className="text-xs leading-snug py-1">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-[10px] font-mono text-[var(--j-acc,_#00d9ff)]/70 shrink-0">
          {ev.action}
        </span>
        <span className="text-neutral-500 font-mono text-[10px] truncate">
          {ev.repo.split("/")[1] ?? ev.repo}
        </span>
        <span className="ml-auto text-[10px] font-mono text-neutral-600 shrink-0">
          {formatRelativeTime(ev.createdAt)}
        </span>
      </div>
      {ev.detail && (
        <div className="text-[11px] text-neutral-300 truncate mt-0.5">
          {ev.detail}
        </div>
      )}
    </div>
  );

  if (ev.url) {
    return (
      <a
        href={ev.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:bg-neutral-900/50 rounded px-1 -mx-1 transition-colors"
      >
        {content}
      </a>
    );
  }
  return content;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-lg font-light tabular-nums text-neutral-100">
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </div>
    </div>
  );
}

export function GithubWidget() {
  const { data, isLoading } = usePoll<GithubData>("/api/github", 10 * 60_000);

  return (
    <Card
      widget="news"
      title="GitHub"
      className="sm:col-span-2 lg:col-span-4"
      action={
        data?.user ? (
          <span className="text-[10px] font-mono text-[var(--j-acc,_#00d9ff)]/60 uppercase tracking-wider">
            @{data.user.login}
          </span>
        ) : null
      }
    >
      {data?.error && (data?.events?.length ?? 0) === 0 ? (
        <div className="text-xs text-rose-400/80">Fejl: {data.error}</div>
      ) : isLoading && !data ? (
        <div className="text-xs text-neutral-500 py-4">Henter GitHub-data…</div>
      ) : (
        <div className="space-y-3">
          {/* Stat row */}
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Repos" value={data?.user?.publicRepos ?? 0} />
            <Stat label="Stars" value={data?.starsTotal ?? 0} />
            <Stat label="Commits 7d" value={data?.commitsLast7d ?? 0} />
            <Stat label="Events 7d" value={data?.eventsLast7d ?? 0} />
          </div>

          {/* Contribution heatmap (30 dage) */}
          <div className="pt-2 border-t border-cyan-400/10">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">
                30 dages aktivitet
              </span>
              <span className="text-[9px] font-mono text-neutral-600">
                {data?.contrib.reduce((s, d) => s + d.count, 0) ?? 0} i alt
              </span>
            </div>
            <ContribHeatmap days={data?.contrib ?? []} />
          </div>

          {/* Events feed */}
          <div className="pt-2 border-t border-cyan-400/10">
            <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 mb-1">
              Seneste aktivitet
            </div>
            {data?.events.length === 0 ? (
              <div className="text-xs text-neutral-500 py-1">Ingen offentlig aktivitet</div>
            ) : (
              <div className="divide-y divide-cyan-400/5 max-h-48 overflow-y-auto pr-1">
                {(data?.events ?? []).slice(0, 8).map((ev, i) => (
                  <EventRow key={`${ev.createdAt}-${i}`} ev={ev} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
