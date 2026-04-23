"use client";
import { useState, useMemo } from "react";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/formatters";
import type { FeedBundle } from "@/lib/types";

const SOURCE_COLORS: Record<string, string> = {
  DR: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  Politiken: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  BBC: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  Reddit: "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

const TABS = ["Alle", "DR", "Politiken", "BBC", "Reddit"] as const;
type Tab = (typeof TABS)[number];

export function NewsWidget() {
  const { data, isLoading } = usePoll<FeedBundle>("/api/feeds", 5 * 60_000);
  const [tab, setTab] = useState<Tab>("Alle");

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (tab === "Alle") return items.slice(0, 20);
    return items.filter((i) => i.source === tab).slice(0, 20);
  }, [data, tab]);

  return (
    <Card
      widget="news"
      title="Nyheder"
      className="sm:col-span-2 lg:col-span-8"
      action={
        <span className="text-xs text-neutral-500 font-mono">
          {data ? `${data.items.length} historier` : isLoading ? "..." : "—"}
        </span>
      }
    >
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-full text-xs whitespace-nowrap border transition-colors ${
              tab === t
                ? "bg-neutral-800 border-neutral-700 text-neutral-100"
                : "bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="text-xs text-neutral-500 py-4 text-center">
            {isLoading ? "Henter …" : "Ingen historier"}
          </div>
        ) : (
          filtered.map((item, i) => (
            <a
              key={`${item.link}-${i}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2.5 rounded-lg bg-neutral-900/50 hover:bg-neutral-900 border border-transparent hover:border-neutral-800 transition-colors group"
            >
              <div className="flex items-start gap-2">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider flex-shrink-0 mt-0.5 ${
                    SOURCE_COLORS[item.source] ?? "text-neutral-400 bg-neutral-800 border-neutral-700"
                  }`}
                >
                  {item.source}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-neutral-200 group-hover:text-white leading-snug">
                    {item.title}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                    {formatRelativeTime(item.pubDate)}
                  </div>
                </div>
              </div>
            </a>
          ))
        )}
      </div>

      {data?.errors && data.errors.length > 0 && (
        <div className="mt-2 text-[10px] text-amber-500/70">
          Fejl: {data.errors.join(" · ")}
        </div>
      )}
    </Card>
  );
}
