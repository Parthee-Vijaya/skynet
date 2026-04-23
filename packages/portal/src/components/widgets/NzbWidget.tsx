"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/formatters";
import type { NzbData } from "@/lib/types";

export function NzbWidget() {
  const { data, isLoading } = usePoll<NzbData>("/api/nzb", 5 * 60_000);

  return (
    <Card
      widget="plex"
      title="NZBGeek"
      className="sm:col-span-2 lg:col-span-4"
      action={
        <span className="text-xs text-neutral-500 font-mono">
          {data?.items.length ?? (isLoading ? "..." : 0)} nye
        </span>
      }
    >
      {!data?.configured ? (
        <div className="text-xs text-neutral-500 space-y-2">
          <div className="text-neutral-400">Ikke konfigureret</div>
          <div>
            Log ind på nzbgeek.info → Dashboard → RSS Generator, og gem URL&apos;en i indstillinger
            under nøglen <span className="font-mono text-neutral-300">nzbgeek_rss_url</span>.
          </div>
        </div>
      ) : data.error ? (
        <div className="text-xs text-rose-400/80">Fejl: {data.error}</div>
      ) : data.items.length === 0 ? (
        <div className="text-xs text-neutral-500 py-2">Ingen nye uploads</div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
          {data.items.map((item, i) => (
            <a
              key={`${item.link}-${i}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2 rounded-lg bg-neutral-900/50 hover:bg-neutral-900 border border-transparent hover:border-neutral-800 transition-colors"
            >
              <div className="text-xs text-neutral-200 truncate">{item.title}</div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-neutral-500">
                {item.size && <span>{item.size}</span>}
                {item.category && <span className="text-sky-400/70">{item.category}</span>}
                <span className="ml-auto">{formatRelativeTime(item.pubDate)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
