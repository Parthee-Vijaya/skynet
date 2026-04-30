"use client";
import { usePoll } from "@/hooks/usePoll";
import type { ClaudeStatusData, ClaudeRateLimit, ClaudeLiveWindow } from "@/lib/types";
import { fmtTok, timeSince } from "@/lib/formatters";
import { Section, Dot } from "../primitives";

/**
 * Live-window-linje. Foretrækker udledt procent fra JSONL hvis tilgængelig,
 * ellers viser kun token-antal. Falder tilbage til stale rate-limit hvis
 * ingen plan-grænse er udledt endnu.
 */
function LiveRow({
  label,
  live,
  fallbackBucket,
  rateLimitsStale,
}: {
  label: string;
  live: ClaudeLiveWindow | undefined;
  fallbackBucket: ClaudeRateLimit | null | undefined;
  rateLimitsStale: boolean | undefined;
}) {
  // 1) Bedste case: vi har udledt procent fra JSONL — altid live
  if (live && live.estimatedPercent != null) {
    const pct = Math.round(live.estimatedPercent);
    const tone = pct >= 80 ? "text-rose-400" : pct >= 50 ? "text-amber-400" : "text-neutral-200";
    return (
      <tr>
        <td className="text-neutral-500 py-0.5 truncate">{label}</td>
        <td className={`text-right ${tone} tabular-nums`}>
          {pct}%
          <span className="text-neutral-600 font-normal ml-1.5">· {fmtTok(live.tokens)}</span>
        </td>
      </tr>
    );
  }

  // 2) Tokens uden procent (hvis vi ikke har udledt grænse endnu)
  if (live && live.tokens > 0) {
    return (
      <tr>
        <td className="text-neutral-500 py-0.5 truncate">{label}</td>
        <td className="text-right text-neutral-200 tabular-nums">
          {fmtTok(live.tokens)}
          <span className="text-neutral-700 font-normal ml-1.5">· {live.messages} msg</span>
        </td>
      </tr>
    );
  }

  // 3) Fallback: vis stale rate-limit-procent (det gamle pre-live-mode display)
  if (fallbackBucket) {
    const pct = Math.round(fallbackBucket.usedPercent);
    const tone = rateLimitsStale ? "text-neutral-600" : pct >= 80 ? "text-rose-400" : pct >= 50 ? "text-amber-400" : "text-neutral-200";
    return (
      <tr>
        <td className={`py-0.5 truncate ${rateLimitsStale ? "text-neutral-700" : "text-neutral-500"}`}>{label}</td>
        <td className={`text-right ${tone} tabular-nums`}>
          {pct}%
          {rateLimitsStale && <span className="text-neutral-700 font-normal ml-1.5">· stale</span>}
        </td>
      </tr>
    );
  }

  // 4) Ingen data
  return (
    <tr>
      <td className="text-neutral-600 py-0.5">{label}</td>
      <td className="text-right text-neutral-700 tabular-nums">—</td>
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

        {/* ── Plan-usage / live-windows sektion ── */}
        {(data?.liveWindows || rl) && (
          <div className="mt-3 pt-2.5 border-t border-dashed border-neutral-800">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-600">
                plan usage · live
              </span>
              {data?.liveWindows ? (
                <span
                  className="text-[10px] text-emerald-500/70"
                  title="Beregnet løbende fra JSONL — altid live"
                >
                  ● fra jsonl
                </span>
              ) : rl?.stale ? (
                <span className="text-[10px] text-amber-500/80">⚠ stale · {timeSince(rl.updatedAt)}</span>
              ) : rl?.updatedAt ? (
                <span className="text-[10px] text-neutral-700">
                  opdateret {timeSince(rl.updatedAt)}
                </span>
              ) : null}
            </div>
            <table className="w-full text-[12px]">
              <tbody>
                <LiveRow
                  label="5-hour"
                  live={data?.liveWindows?.fiveHour}
                  fallbackBucket={rl?.fiveHour}
                  rateLimitsStale={rl?.stale}
                />
                <LiveRow
                  label="weekly"
                  live={data?.liveWindows?.sevenDay}
                  fallbackBucket={rl?.sevenDay}
                  rateLimitsStale={rl?.stale}
                />
              </tbody>
            </table>
            {data?.liveWindows && !data.liveWindows.fiveHour.estimatedPercent && (
              <div className="text-[10px] text-neutral-700 mt-1.5 leading-snug">
                Procent vises efter første interaktive <code className="text-neutral-500">claude</code>-session
                hvor vi kan udlede din plan-grænse.
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
