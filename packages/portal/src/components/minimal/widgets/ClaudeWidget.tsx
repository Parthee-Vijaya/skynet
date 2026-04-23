"use client";
import { usePoll } from "@/hooks/usePoll";
import type { ClaudeStatusData, ClaudeRateLimit } from "@/lib/types";
import { Section, Dot } from "../primitives";

function fmtTok(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + " b";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " m";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " k";
  return String(n);
}

/** Én plan-usage linje · "5-hour limit   16% · resets 1h" */
function PlanRow({ label, bucket }: { label: string; bucket: ClaudeRateLimit | null }) {
  if (!bucket) {
    return (
      <tr>
        <td className="text-neutral-600 py-0.5">{label}</td>
        <td className="text-right text-neutral-700 tabular-nums">—</td>
      </tr>
    );
  }
  const pct = Math.round(bucket.usedPercent);
  const tone = pct >= 80 ? "text-rose-400" : pct >= 50 ? "text-amber-400" : "text-neutral-200";
  return (
    <tr>
      <td className="text-neutral-500 py-0.5 truncate">{label}</td>
      <td className={`text-right ${tone} tabular-nums`}>
        {pct}%
        {bucket.resetsIn && (
          <span className="text-neutral-600 font-normal ml-1.5">· {bucket.resetsIn}</span>
        )}
      </td>
    </tr>
  );
}

export function ClaudeWidget() {
  const { data } = usePoll<ClaudeStatusData>("/api/claude", 60_000);

  const msgToday = data?.today.messages ?? 0;
  const todayTotal = data?.today.total ?? 0;
  const weekTotal = data?.week.total ?? 0;
  const total = data?.total.total ?? 0;
  const rl = data?.rateLimits;

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

        {/* ── Plan-usage sektion (vises kun hvis rate-limits-cache er udfyldt) ── */}
        {rl && (rl.fiveHour || rl.sevenDay || rl.sevenDayOpus) && (
          <div className="mt-3 pt-2.5 border-t border-dashed border-neutral-800">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-600">plan usage</span>
              {rl.stale && (
                <span className="text-[10px] text-amber-500/70">⚠ gamle data</span>
              )}
            </div>
            <table className="w-full text-[12px]">
              <tbody>
                <PlanRow label="5-hour limit" bucket={rl.fiveHour} />
                <PlanRow label="weekly · all models" bucket={rl.sevenDay} />
                <PlanRow label="weekly · opus/sonnet" bucket={rl.sevenDayOpus} />
              </tbody>
            </table>
          </div>
        )}

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
