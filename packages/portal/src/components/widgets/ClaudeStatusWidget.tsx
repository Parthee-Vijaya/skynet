"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/charts/Sparkline";
import type { ClaudeStatusData, HistoryPoint } from "@/lib/types";

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

export function ClaudeStatusWidget() {
  const { data } = usePoll<ClaudeStatusData>("/api/claude", 60_000);

  const today = data?.today.total ?? 0;
  const week = data?.week.total ?? 0;
  const ytd = data?.yearToDate.total ?? 0;

  const weekPoints: HistoryPoint[] = (data?.dailyTotals ?? []).map((d, i) => ({
    ts: i,
    value: d.tokens,
  }));

  return (
    <Card
      title="Claude Code"
      className="sm:col-span-2 lg:col-span-2"
      action={
        <span className="text-[10px] text-neutral-500 font-mono">
          {data?.today.messages ?? 0} beskeder i dag
        </span>
      }
    >
      {!data ? (
        <div className="text-neutral-500 text-sm">Indlæser...</div>
      ) : (
        <>
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">I dag</span>
              <span className="text-xl font-thin tabular-nums text-neutral-100">
                {formatTokens(today)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Denne uge</span>
              <span className="text-xl font-thin tabular-nums text-violet-300">
                {formatTokens(week)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">År til dato</span>
              <span className="text-xl font-thin tabular-nums text-violet-400">
                {formatTokens(ytd)}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-neutral-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                Sidste 7 dage
              </span>
              <span className="text-[10px] text-neutral-600 font-mono tabular-nums">
                tokens/dag
              </span>
            </div>
            <Sparkline points={weekPoints} color="#a78bfa" height={32} />
          </div>
        </>
      )}
    </Card>
  );
}
