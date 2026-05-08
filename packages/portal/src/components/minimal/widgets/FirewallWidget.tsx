"use client";
import { usePoll } from "@/hooks/usePoll";
import { Section, Dot, OkLabel, WarnLabel } from "../primitives";
import { formatRate, timeSince, truncate } from "@/lib/formatters";
import type { FirewallSummary } from "@/lib/collectors/firewall";

/**
 * Firewall / Network Monitor — cockpit-widget (Fase 1: monitor-only).
 *
 * Viser:
 * - Status (PROTECTED / MONITOR / OFFLINE) + collector-tick info
 * - Top-3 talkers (process + bytes/sek)
 * - Antal aktive flows
 * - Nyeste "ny app phoned home"-event (med link til /firewall)
 *
 * Polling: 5s mod /api/firewall (cached 2s server-side).
 */
export function FirewallWidget() {
  const { data, error } = usePoll<FirewallSummary>("/api/firewall", 5000);

  if (error) {
    return (
      <Section title="firewall" right={<span className="text-[#d87373]"><Dot tone="bad" />fejl</span>} className="col-span-12 lg:col-span-6">
        <div className="text-[11px] text-neutral-700 font-mono">collector ikke tilgængelig</div>
      </Section>
    );
  }

  if (!data) {
    return (
      <Section title="firewall" right={<span className="text-neutral-700">indlæser…</span>} className="col-span-12 lg:col-span-6">
        <div className="text-[11px] text-neutral-700 font-mono">—</div>
      </Section>
    );
  }

  const collectorOk = data.collector.running && data.collector.lastTickOk;
  const enforcementLabel =
    data.enforcement === "lulu" ? <OkLabel>protected</OkLabel> : <WarnLabel>monitor</WarnLabel>;

  const right = (
    <span>
      {enforcementLabel}
      <span className="mx-1 text-neutral-700">·</span>
      <span className="text-neutral-500 tabular-nums">{data.activeFlows} flow</span>
    </span>
  );

  const totalRate = data.topTalkers.reduce((sum, t) => sum + t.bytes_in + t.bytes_out, 0);
  const collectorAge = data.collector.lastTickAt ? timeSince(data.collector.lastTickAt) : "—";
  const intervalLabel = `${Math.round(data.collector.intervalMs / 1000)}s`;
  const lastNewApp = data.recentNewApps[0];

  return (
    <Section title="firewall" right={right} className="col-span-12 lg:col-span-6">
      <div className="font-mono">
        {/* Top-talkers ────────────────────────────────────────────────────── */}
        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-600 mb-1">
          top talkers
        </div>
        {data.topTalkers.length === 0 ? (
          <div className="text-[11px] text-neutral-700">ingen aktivitet</div>
        ) : (
          <div className="space-y-0.5 text-[11px]">
            {data.topTalkers.slice(0, 3).map((t) => {
              const total = t.bytes_in + t.bytes_out;
              const pct = totalRate > 0 ? (total / totalRate) * 100 : 0;
              return (
                <div key={t.process} className="flex items-center justify-between gap-2">
                  <span className="text-neutral-200 truncate flex-1">{truncate(t.process, 22)}</span>
                  <span className="text-neutral-500 tabular-nums text-right" style={{ minWidth: 70 }}>
                    {/* /60s window → bytes/sek */}
                    {formatRate(total / 60)}
                  </span>
                  <span className="text-neutral-700 tabular-nums" style={{ minWidth: 28 }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Latest new-app alert ───────────────────────────────────────────── */}
        {lastNewApp && (
          <div className="mt-3 pt-2 border-t border-dashed border-neutral-900 text-[11px]">
            <div className="flex items-baseline gap-2">
              <span className="text-amber-400">⚠ ny</span>
              <span className="text-neutral-200 truncate">{truncate(lastNewApp.process ?? "?", 18)}</span>
              <span className="text-neutral-700">→</span>
              <span className="text-neutral-500 truncate flex-1">
                {lastNewApp.rhost ?? lastNewApp.raddr ?? "?"}
              </span>
              <span className="text-neutral-700 shrink-0">{timeSince(lastNewApp.ts)}</span>
            </div>
          </div>
        )}

        {/* Collector-meta ─────────────────────────────────────────────────── */}
        <div className="mt-3 pt-2 border-t border-dashed border-neutral-900 text-[11px] text-neutral-500 leading-tight">
          <div className="flex justify-between">
            <span className="text-neutral-700">tick</span>
            <span className={collectorOk ? "text-neutral-300" : "text-[#d87373]"}>
              {collectorOk ? collectorAge : "fejl"} · {intervalLabel} interval
            </span>
          </div>
          {data.unackedAlertCount > 0 && (
            <div className="flex justify-between">
              <span className="text-neutral-700">åbne</span>
              <span className="text-amber-400 tabular-nums">{data.unackedAlertCount} alerts</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-3 text-[11px]">
          <a href="/firewall" className="text-sky-400 hover:text-sky-300">
            → åbn firewall
          </a>
        </div>
      </div>
    </Section>
  );
}
