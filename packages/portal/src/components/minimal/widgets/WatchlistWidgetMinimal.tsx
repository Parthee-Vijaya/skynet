"use client";
import { usePoll } from "@/hooks/usePoll";
import type { WatchlistData, WatchlistStatus } from "@/lib/watchlist";
import { Section } from "../primitives";

const TONE: Record<WatchlistStatus, string> = {
  pending: "#6b6b6b",
  downloading: "#9bd0ff",
  partial: "#e6b450",
  ready: "#7dd67d",
};

const LABEL: Record<WatchlistStatus, string> = {
  pending: "afventer",
  downloading: "henter",
  partial: "delvis",
  ready: "klar",
};

export function WatchlistWidgetMinimal() {
  const { data } = usePoll<WatchlistData>("/api/watchlist", 30_000);

  const right = (() => {
    if (!data) return undefined;
    const sOn = data.online.sonarr;
    const rOn = data.online.radarr;
    if (!sOn && !rOn) {
      const cfg = data.configured.sonarr || data.configured.radarr;
      return <span className="text-neutral-600">{cfg ? "○ offline" : "○ ikke konfigureret"}</span>;
    }
    const active = data.counts.downloading;
    if (active > 0) {
      return <span className="text-blue-400/80">↓ {active} henter</span>;
    }
    const pending = data.counts.pending;
    if (pending > 0) {
      return <span className="text-neutral-500">{pending} afventer</span>;
    }
    return <span className="text-emerald-500/80">○ {data.counts.total} items</span>;
  })();

  // Top-5: prioritér downloading, så pending, så partial
  const order: Record<WatchlistStatus, number> = { downloading: 0, pending: 1, partial: 2, ready: 3 };
  const top = (data?.items ?? [])
    .slice()
    .sort((a, b) => order[a.status] - order[b.status])
    .filter((it) => it.status !== "ready")
    .slice(0, 5);

  return (
    <Section title="watchlist" right={right}>
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : !data.configured.sonarr && !data.configured.radarr ? (
        <div className="font-mono text-[11px] text-neutral-600 space-y-1">
          <div>API-keys ikke fundet.</div>
          <a href="/settings" className="text-neutral-500 hover:text-neutral-300 underline-offset-2 hover:underline">
            konfigurer i settings →
          </a>
        </div>
      ) : top.length === 0 ? (
        <div className="font-mono text-[11px] text-neutral-600 space-y-1">
          <div>alt klart eller intet at se.</div>
          <a href="/watchlist" className="text-neutral-500 hover:text-neutral-300 underline-offset-2 hover:underline">
            tilføj titel →
          </a>
        </div>
      ) : (
        <div className="font-mono space-y-[3px]">
          {top.map((item) => (
            <a
              key={`${item.service}-${item.serviceId}`}
              href="/watchlist"
              className="block hover:bg-neutral-900/40 -mx-1 px-1 py-0.5 rounded-sm transition-colors"
              data-sensitive
            >
              <div className="flex items-baseline gap-2 text-[10.5px]">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: TONE[item.status] }}
                  aria-hidden
                />
                <span className="text-neutral-300 truncate flex-1">{item.title}</span>
                <span className="text-neutral-700 shrink-0">
                  {item.type === "tv" ? "📺" : "🎬"}
                </span>
              </div>
              <div className="text-[9px] text-neutral-600 pl-3.5 truncate">
                {LABEL[item.status]} · {item.detail}
              </div>
            </a>
          ))}
          <a
            href="/watchlist"
            className="block pt-1 mt-1 border-t border-dashed border-neutral-900 text-[9.5px] text-neutral-600 hover:text-neutral-400"
          >
            se hele watchlist →
          </a>
        </div>
      )}
    </Section>
  );
}
