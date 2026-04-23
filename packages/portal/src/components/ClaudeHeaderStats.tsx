"use client";
import { usePoll } from "@/hooks/usePoll";
import type { ClaudeStatusData } from "@/lib/types";

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[9px] text-cyan-400/50 uppercase tracking-[0.15em] sm:tracking-[0.2em] font-mono">
        {label}
      </span>
      <span
        className={`text-sm font-light tabular-nums ${
          accent ? "text-cyan-200" : "text-neutral-100"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function ClaudeHeaderStats() {
  const { data } = usePoll<ClaudeStatusData>("/api/claude", 60_000);

  const today = data?.today.total ?? 0;
  const week = data?.week.total ?? 0;
  const total = data?.total.total ?? 0;

  return (
    <div className="flex items-center gap-2 sm:gap-4 px-2.5 sm:px-4 py-2 rounded-lg border border-cyan-400/20 bg-cyan-500/5 backdrop-blur-sm shrink-0 w-full sm:w-auto">
      {/* Label block — hidden on very narrow screens */}
      <div className="hidden sm:flex flex-col shrink-0">
        <span className="text-[9px] text-cyan-400/60 uppercase tracking-[0.2em] font-mono">
          Claude Code
        </span>
        <span className="text-[10px] text-neutral-500 font-mono">
          {data?.today.messages ?? 0} beskeder i dag
        </span>
      </div>
      <div className="hidden sm:block h-8 w-px bg-cyan-400/15" />

      <Stat label="I dag" value={formatTokens(today)} />
      <Stat label="Uge" value={formatTokens(week)} />
      <Stat label="Total" value={formatTokens(total)} accent />

      <div className="h-8 w-px bg-cyan-400/15" />
      <div className="flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot"
          style={{ boxShadow: "0 0 8px #00d9ff" }}
        />
        <span className="text-[9px] text-cyan-300/80 uppercase tracking-[0.2em] font-mono hidden sm:inline">
          Operational
        </span>
      </div>
    </div>
  );
}
