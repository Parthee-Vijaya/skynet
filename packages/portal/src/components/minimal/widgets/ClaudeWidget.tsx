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

function timeSince(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "lige nu";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "lige nu";
  if (mins < 60) return `${mins}m siden`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}t siden`;
  const days = Math.round(hours / 24);
  return `${days}d siden`;
}

/** Én plan-usage linje · "5-hour limit   16% · resets 1h" */
function PlanRow({ label, bucket, stale }: { label: string; bucket: ClaudeRateLimit | null; stale?: boolean }) {
  if (!bucket) {
    return (
      <tr>
        <td className="text-neutral-600 py-0.5">{label}</td>
        <td className="text-right text-neutral-700 tabular-nums">—</td>
      </tr>
    );
  }
  const pct = Math.round(bucket.usedPercent);
  // Når stale: dæmp farverne så det er tydeligt at det IKKE er live data
  const tone = stale
    ? "text-neutral-600"
    : pct >= 80 ? "text-rose-400" : pct >= 50 ? "text-amber-400" : "text-neutral-200";
  return (
    <tr>
      <td className={`py-0.5 truncate ${stale ? "text-neutral-700" : "text-neutral-500"}`}>{label}</td>
      <td className={`text-right ${tone} tabular-nums`}>
        {pct}%
        {bucket.resetsIn && (
          <span className={`font-normal ml-1.5 ${stale ? "text-neutral-700" : "text-neutral-600"}`}>· {bucket.resetsIn}</span>
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
              <span className={`text-[10px] uppercase tracking-[0.2em] ${rl.stale ? "text-neutral-700" : "text-neutral-600"}`}>
                plan usage
              </span>
              {rl.stale ? (
                <span
                  className="text-[10px] text-amber-500/80"
                  title="Værdierne er ikke live — kør 'claude' for at opdatere"
                >
                  ⚠ ikke live · {timeSince(rl.updatedAt)}
                </span>
              ) : rl.updatedAt ? (
                <span className="text-[10px] text-neutral-700">
                  opdateret {timeSince(rl.updatedAt)}
                </span>
              ) : null}
            </div>
            <table className="w-full text-[12px]">
              <tbody>
                <PlanRow label="5-hour limit" bucket={rl.fiveHour} stale={rl.stale} />
                <PlanRow label="weekly · all models" bucket={rl.sevenDay} stale={rl.stale} />
                <PlanRow label="weekly · opus/sonnet" bucket={rl.sevenDayOpus} stale={rl.stale} />
              </tbody>
            </table>
            {rl.stale && (
              <div className="text-[10px] text-neutral-700 mt-1.5 leading-snug">
                Kør <code className="text-neutral-500">claude</code> en gang for at refreshe rate-limits via statusline-hook.
              </div>
            )}
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
