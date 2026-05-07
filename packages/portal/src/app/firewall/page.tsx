"use client";
import { useEffect, useMemo, useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section, Dot, OkLabel, WarnLabel, BadLabel } from "@/components/minimal/primitives";
import { formatBytes, formatRate, timeSince, truncate } from "@/lib/formatters";
import type { FirewallSummary } from "@/lib/collectors/firewall";
import type { NetConnRow, NetEventRow } from "@/lib/firewall/store";

type Tab = "live" | "events";

interface ConnectionWithGeo extends NetConnRow {
  country: string | null;
  country_code: string | null;
  city: string | null;
  isp: string | null;
  asn_org: string | null;
}

type SortKey = "process" | "raddr" | "rport" | "country" | "bytes" | "ts";
type SortDir = "asc" | "desc";

export default function FirewallPage() {
  const [tab, setTab] = useState<Tab>("live");

  return (
    <MinimalPageLayout active="firewall">
      <main className="px-4 sm:px-6 py-4 max-w-[1400px] mx-auto">
        <Header />
        <Tabs tab={tab} onChange={setTab} />
        <div className="mt-4">
          {tab === "live" && <LiveTab />}
          {tab === "events" && <EventsTab />}
        </div>
      </main>
    </MinimalPageLayout>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header() {
  const { data } = usePoll<FirewallSummary>("/api/firewall", 5000);

  const enforcement =
    data?.enforcement === "lulu" ? <OkLabel>protected (lulu)</OkLabel>
      : data?.enforcement === "monitor" ? <WarnLabel>monitor only</WarnLabel>
      : <BadLabel>unknown</BadLabel>;

  const collectorOk = data?.collector.running && data?.collector.lastTickOk;

  return (
    <div className="flex items-baseline justify-between flex-wrap gap-y-2 mb-4">
      <h1 className="font-mono text-[14px] text-neutral-200">
        firewall <span className="text-neutral-600">/ network monitor</span>
      </h1>
      <div className="font-mono text-[11px] text-neutral-500 flex items-center gap-3">
        {enforcement}
        <span className="text-neutral-700">·</span>
        <span>flows: <span className="text-neutral-200 tabular-nums">{data?.activeFlows ?? "—"}</span></span>
        <span className="text-neutral-700">·</span>
        <span>
          collector:{" "}
          {collectorOk ? (
            <span className="text-[#7dd67d]">
              <Dot tone="ok" />
              {data?.collector.lastTickAt ? timeSince(data.collector.lastTickAt) : "ok"}
            </span>
          ) : (
            <span className="text-[#d87373]"><Dot tone="bad" />offline</span>
          )}
        </span>
        {data?.unackedAlertCount ? (
          <>
            <span className="text-neutral-700">·</span>
            <span className="text-amber-400 tabular-nums">{data.unackedAlertCount} alerts</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: "live", label: "live" },
    { id: "events", label: "events" },
  ];
  return (
    <div className="flex gap-1 border-b border-neutral-900 font-mono text-[12px]">
      {items.map((it) => {
        const active = it.id === tab;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={
              "px-3 py-2 -mb-px border-b transition-colors " +
              (active
                ? "text-neutral-100 border-neutral-100"
                : "text-neutral-500 border-transparent hover:text-neutral-300")
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Live tab ─────────────────────────────────────────────────────────────────

function LiveTab() {
  const [filter, setFilter] = useState("");
  const [showLocalOnly, setShowLocalOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("ts");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showOnlyNew, setShowOnlyNew] = useState(false);

  const url = useMemo(() => {
    const u = new URLSearchParams();
    u.set("dedup", "1");
    u.set("limit", "500");
    u.set("since", "now-5m");
    if (filter) u.set("process", filter);
    return `/api/firewall/connections?${u.toString()}`;
  }, [filter]);

  const { data, error } = usePoll<{ connections: ConnectionWithGeo[]; count: number }>(url, 5000);

  const sorted = useMemo(() => {
    if (!data?.connections) return [];
    let rows = data.connections;
    if (showOnlyNew) rows = rows.filter((r) => r.is_new === 1);
    if (!showLocalOnly) rows = rows.filter((r) => !!r.raddr);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "process":
            return a.process.localeCompare(b.process);
          case "raddr":
            return (a.raddr ?? "").localeCompare(b.raddr ?? "");
          case "rport":
            return (a.rport ?? 0) - (b.rport ?? 0);
          case "country":
            return (a.country ?? "").localeCompare(b.country ?? "");
          case "bytes":
            return a.bytes_in + a.bytes_out - (b.bytes_in + b.bytes_out);
          case "ts":
          default:
            return a.ts - b.ts;
        }
      })();
      return cmp * dir;
    });
  }, [data, sortKey, sortDir, showOnlyNew, showLocalOnly]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "process" || k === "raddr" || k === "country" ? "asc" : "desc");
    }
  };

  return (
    <Section title="aktive forbindelser" right={<span>{sorted.length} rækker · sidste 5 min</span>}>
      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap mb-3 font-mono text-[11px]">
        <input
          type="text"
          placeholder="filter på proces…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 px-2 py-1 text-neutral-100 rounded-sm focus:outline-none focus:border-neutral-600"
        />
        <label className="flex items-center gap-1 text-neutral-500 cursor-pointer">
          <input type="checkbox" checked={showOnlyNew} onChange={(e) => setShowOnlyNew(e.target.checked)} />
          kun nye
        </label>
        <label className="flex items-center gap-1 text-neutral-500 cursor-pointer">
          <input type="checkbox" checked={showLocalOnly} onChange={(e) => setShowLocalOnly(e.target.checked)} />
          inkl. listen-sockets
        </label>
        {error && <span className="text-[#d87373]">fejl: {error.message}</span>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-[11px] tabular-nums">
          <thead>
            <tr className="text-neutral-600 text-[10px] uppercase tracking-wider">
              <Th label="proces" k="process" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="remote" k="raddr" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="port" k="rport" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right" />
              <Th label="proto" k="ts" sortKey={sortKey} sortDir={sortDir} onSort={() => { /* noop sort */ }} />
              <Th label="country" k="country" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="text-left py-1.5 pr-3">isp</th>
              <Th label="bytes" k="bytes" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right" />
              <Th label="set" k="ts" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-6 text-neutral-700">
                  ingen forbindelser i tidsvinduet
                </td>
              </tr>
            )}
            {sorted.map((c) => (
              <tr
                key={c.id}
                className={
                  "border-t border-neutral-900 " +
                  (c.is_new === 1 ? "bg-amber-500/5" : "hover:bg-neutral-900/40")
                }
              >
                <td className="py-1.5 pr-3 text-neutral-100">
                  {c.is_new === 1 && <span className="text-amber-400 mr-1">●</span>}
                  {truncate(c.process, 22)}
                </td>
                <td className="py-1.5 pr-3 text-neutral-300 max-w-[260px] truncate" title={c.raddr ?? ""}>
                  {c.rhost ?? c.raddr ?? "—"}
                </td>
                <td className="py-1.5 pr-3 text-right text-neutral-400">{c.rport ?? "—"}</td>
                <td className="py-1.5 pr-3 text-neutral-600">{c.proto}</td>
                <td className="py-1.5 pr-3 text-neutral-300">
                  {c.country_code ? (
                    <>
                      {flagEmoji(c.country_code)} <span className="text-neutral-500">{c.country_code}</span>
                    </>
                  ) : (
                    <span className="text-neutral-700">—</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-neutral-500 max-w-[180px] truncate" title={c.isp ?? c.asn_org ?? ""}>
                  {truncate(c.isp ?? c.asn_org ?? "—", 24)}
                </td>
                <td className="py-1.5 pr-3 text-right text-neutral-400">
                  {c.bytes_in + c.bytes_out > 0 ? formatBytes(c.bytes_in + c.bytes_out) : <span className="text-neutral-700">—</span>}
                </td>
                <td className="py-1.5 pr-3 text-right text-neutral-600">{timeSince(c.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = k === sortKey;
  const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "";
  return (
    <th
      className={"text-left py-1.5 pr-3 cursor-pointer select-none " + className}
      onClick={() => onSort(k)}
    >
      <span className={active ? "text-neutral-300" : ""}>{label} {arrow}</span>
    </th>
  );
}

// ── Events tab ───────────────────────────────────────────────────────────────

function EventsTab() {
  const [kind, setKind] = useState<string>("");
  const url = useMemo(() => {
    const u = new URLSearchParams();
    u.set("limit", "100");
    u.set("since", "now-7d");
    if (kind) u.set("kind", kind);
    return `/api/firewall/events?${u.toString()}`;
  }, [kind]);

  const { data, error } = usePoll<{ events: NetEventRow[]; count: number }>(url, 8000);

  const ack = async (id: number) => {
    await fetch(`/api/firewall/events/${id}/ack`, { method: "POST" });
    // optimistic — usePoll vil refresh inden for 8s
  };

  return (
    <Section title="hændelser" right={<span>{data?.events.length ?? 0} hændelser · sidste 7 dage</span>}>
      <div className="flex items-center gap-2 mb-3 font-mono text-[11px]">
        <span className="text-neutral-600">filter:</span>
        {[
          { id: "", label: "alle" },
          { id: "new_app", label: "ny app" },
          { id: "blocked", label: "blokeret" },
          { id: "profile_switch", label: "profil-skift" },
          { id: "suspicious", label: "mistænkelig" },
        ].map((b) => (
          <button
            key={b.id}
            onClick={() => setKind(b.id)}
            className={
              "px-2 py-0.5 rounded-sm transition-colors " +
              (kind === b.id ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:text-neutral-300")
            }
          >
            {b.label}
          </button>
        ))}
        {error && <span className="text-[#d87373]">fejl: {error.message}</span>}
      </div>

      {(!data || data.events.length === 0) ? (
        <div className="text-neutral-700 text-[12px] text-center py-8">ingen hændelser</div>
      ) : (
        <div className="space-y-2">
          {data.events.map((e) => (
            <EventCard key={e.id} event={e} onAck={() => ack(e.id)} />
          ))}
        </div>
      )}
    </Section>
  );
}

function EventCard({ event, onAck }: { event: NetEventRow; onAck: () => void }) {
  const detail = parseDetail(event.detail);
  const icon =
    event.kind === "new_app" ? "⚠" :
    event.kind === "blocked" ? "✕" :
    event.kind === "allowed" ? "✓" :
    event.kind === "profile_switch" ? "↻" :
    event.kind === "suspicious" ? "?" : "•";
  const tone =
    event.kind === "new_app" ? "text-amber-400" :
    event.kind === "blocked" ? "text-[#d87373]" :
    event.kind === "allowed" ? "text-[#7dd67d]" :
    event.kind === "profile_switch" ? "text-sky-400" :
    "text-neutral-400";

  return (
    <div className={"font-mono text-[11px] border border-neutral-900 rounded-sm px-3 py-2 " + (event.acknowledged ? "opacity-60" : "")}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0 flex-1">
          <span className={tone}>{icon}</span>
          <span className="text-neutral-300">{event.kind}</span>
          {event.process && (
            <>
              <span className="text-neutral-700">·</span>
              <span className="text-neutral-200 truncate">{event.process}</span>
            </>
          )}
          {(event.rhost || event.raddr) && (
            <>
              <span className="text-neutral-700">→</span>
              <span className="text-neutral-500 truncate">{event.rhost ?? event.raddr}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-neutral-700">{timeSince(event.ts)}</span>
          {!event.acknowledged && (
            <button onClick={onAck} className="text-neutral-500 hover:text-neutral-200 text-[10px]">
              ✓ ack
            </button>
          )}
        </div>
      </div>
      {event.llm_explanation && (
        <div className="mt-1 text-neutral-500 leading-snug">{event.llm_explanation}</div>
      )}
      {detail && (
        <div className="mt-1 text-[10px] text-neutral-700">
          {Object.entries(detail).slice(0, 5).map(([k, v]) => (
            <span key={k} className="mr-3">
              {k}=<span className="text-neutral-500">{String(v)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function parseDetail(d: unknown): Record<string, unknown> | null {
  if (!d) return null;
  if (typeof d === "object") return d as Record<string, unknown>;
  if (typeof d === "string") {
    try { return JSON.parse(d); } catch { return null; }
  }
  return null;
}

// ── Country flag emoji ───────────────────────────────────────────────────────

function flagEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return "";
  const A = 0x41;
  const REGIONAL = 0x1f1e6;
  const upper = cc.toUpperCase();
  return String.fromCodePoint(
    REGIONAL + (upper.charCodeAt(0) - A),
    REGIONAL + (upper.charCodeAt(1) - A)
  );
}
