"use client";
import { usePoll } from "@/hooks/usePoll";
import type { ClaudeStatusData } from "@/lib/types";
import { Section, Dot } from "../primitives";

function fmtTok(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + " b";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " m";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " k";
  return String(n);
}

export function ClaudeWidget() {
  const { data } = usePoll<ClaudeStatusData>("/api/claude", 60_000);

  const msgToday = data?.today.messages ?? 0;
  const todayTotal = data?.today.total ?? 0;
  const weekTotal = data?.week.total ?? 0;
  const total = data?.total.total ?? 0;

  return (
    <Section
      title="claude code"
      right={<span>opus 4.7</span>}
      className="col-span-12 lg:col-span-4"
    >
      <div className="font-mono">
        <div className="flex items-baseline gap-3 mt-1">
          <span className="text-[48px] font-extralight text-neutral-50 leading-none tracking-tight tabular-nums">
            {msgToday}
          </span>
          <span className="text-[11px] text-neutral-500">beskeder i dag</span>
        </div>
        <table className="w-full mt-4 text-[12px]">
          <tbody>
            <tr>
              <td className="text-neutral-500 py-0.5">today (tokens)</td>
              <td className="text-right text-neutral-100 tabular-nums">{fmtTok(todayTotal)}</td>
            </tr>
            <tr>
              <td className="text-neutral-500 py-0.5">this week</td>
              <td className="text-right text-neutral-100 tabular-nums">{fmtTok(weekTotal)}</td>
            </tr>
            <tr>
              <td className="text-neutral-500 py-0.5">all-time</td>
              <td className="text-right text-neutral-100 tabular-nums">{fmtTok(total)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 pt-2.5 border-t border-dashed border-neutral-800 flex justify-between text-[11px]">
          <span className="text-[#7dd67d]">
            <Dot tone="ok" />
            operational
          </span>
          <span className="text-neutral-600">tokens · api v2</span>
        </div>
      </div>
    </Section>
  );
}
