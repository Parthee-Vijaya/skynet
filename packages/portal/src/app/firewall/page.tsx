"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section, Dot, OkLabel, WarnLabel, BadLabel } from "@/components/minimal/primitives";
import { formatBytes, formatRate, timeSince, truncate } from "@/lib/formatters";
import type { FirewallSummary } from "@/lib/collectors/firewall";
import type { NetConnRow, NetEventRow, NetRuleRow } from "@/lib/firewall/store";
import type { LuluStatus } from "@/lib/firewall/lulu";
import type { NetProfileRow } from "@/lib/firewall/profiles";
import type { ExplanationResult } from "@/lib/firewall/explain";
import type { InspectResult } from "@/lib/firewall/inspect";

type Tab = "live" | "rules" | "profiles" | "stats" | "apps" | "events";

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
          {tab === "rules" && <RulesTab />}
          {tab === "profiles" && <ProfilesTab />}
          {tab === "stats" && <StatsTab />}
          {tab === "apps" && <AppsTab />}
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
    { id: "rules", label: "regler" },
    { id: "profiles", label: "profiler" },
    { id: "stats", label: "stats" },
    { id: "apps", label: "apps" },
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
  const { data: lulu } = usePoll<LuluStatus>("/api/firewall/lulu-status", 30_000);
  const canEnforce = !!lulu?.cliInstalled && !!lulu?.sudoersOk;
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const blockApp = async (c: ConnectionWithGeo) => {
    setBlockError(null);
    setPendingBlock(c.process);
    try {
      const res = await fetch("/api/firewall/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lulu_key: c.bundle_id ?? c.process,
          exec_path: c.exec_path ?? "*",
          process: c.process,
          action: "block",
          scope: c.rhost ?? c.raddr ? "host" : "all",
          remote_host: c.rhost ?? c.raddr ?? undefined,
          description: `Skynet block: ${c.process} → ${c.rhost ?? c.raddr ?? "*"}`,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setBlockError(err.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setBlockError(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setPendingBlock(null);
    }
  };

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
              <th className="text-right py-1.5 pr-1"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-6 text-neutral-700">
                  ingen forbindelser i tidsvinduet
                </td>
              </tr>
            )}
            {sorted.map((c) => (
              <Fragment key={c.id}>
              <tr
                className={
                  "border-t border-neutral-900 cursor-pointer " +
                  (expandedId === c.id ? "bg-sky-500/10" :
                   c.is_new === 1 ? "bg-amber-500/5" : "hover:bg-neutral-900/40")
                }
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  setExpandedId(expandedId === c.id ? null : c.id);
                }}
              >
                <td className="py-1.5 pr-3 text-neutral-100">
                  <span className="text-neutral-600 mr-1 inline-block w-3">
                    {expandedId === c.id ? "▾" : "▸"}
                  </span>
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
                <td className="py-1.5 pr-1 text-right whitespace-nowrap">
                  {canEnforce && c.raddr && c.state !== "LISTEN" ? (
                    <button
                      disabled={pendingBlock === c.process}
                      onClick={() => blockApp(c)}
                      className="text-[10px] text-[#d87373] hover:text-[#e69090] disabled:opacity-50"
                      title={`Bloker ${c.process} → ${c.rhost ?? c.raddr}`}
                    >
                      {pendingBlock === c.process ? "…" : "✕ block"}
                    </button>
                  ) : null}
                </td>
              </tr>
              {expandedId === c.id && (
                <tr className="border-t border-sky-900/30 bg-neutral-950">
                  <td colSpan={9} className="p-0">
                    <InspectPanel conn={c} canEnforce={canEnforce} onClose={() => setExpandedId(null)} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {blockError && (
        <div className="mt-2 text-[11px] text-[#d87373] font-mono">block fejlede: {blockError}</div>
      )}
      {!canEnforce && (
        <div className="mt-2 text-[11px] text-neutral-700 font-mono">
          {lulu?.cliInstalled === false
            ? "LuLu CLI ikke installeret — block-knapper er deaktiveret. Installer via 'brew install woop/tap/lulu-cli'."
            : lulu?.sudoersOk === false
            ? "Passwordless sudo for lulu-cli mangler — kør 'sudo scripts/install-lulu-sudoers.sh'."
            : ""}
        </div>
      )}
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

// ── InspectPanel — udvidet detalje-visning pr. row ───────────────────────────

function InspectPanel({
  conn,
  canEnforce,
  onClose,
}: {
  conn: ConnectionWithGeo;
  canEnforce: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<InspectResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [llmRunning, setLlmRunning] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const runInspect = async (withLLM = false) => {
    if (!withLLM) setLoading(true);
    if (withLLM) setLlmRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/firewall/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raddr: conn.raddr,
          rhost: conn.rhost,
          laddr: conn.laddr,
          rport: conn.rport,
          proto: conn.proto,
          process: conn.process,
          bundle_id: conn.bundle_id,
          pid: conn.pid,
          runLLM: withLLM,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as InspectResult;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setLoading(false);
      setLlmRunning(false);
    }
  };

  useEffect(() => {
    void runInspect(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.id]);

  const blockHost = async () => {
    if (!conn.raddr && !conn.rhost) return;
    setActionPending("block_host");
    setActionResult(null);
    try {
      const res = await fetch("/api/firewall/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lulu_key: conn.bundle_id ?? conn.process,
          exec_path: conn.exec_path ?? "*",
          process: conn.process,
          action: "block",
          scope: conn.rport ? "host:port" : "host",
          remote_host: conn.rhost ?? conn.raddr,
          remote_port: conn.rport ?? undefined,
          description: `Skynet inspect-block: ${conn.process} → ${conn.rhost ?? conn.raddr}${conn.rport ? `:${conn.rport}` : ""}`,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      setActionResult(json.ok ? "✓ regel oprettet — LuLu reload'et" : `fejl: ${json.error ?? `HTTP ${res.status}`}`);
    } catch (e) {
      setActionResult("fejl: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionPending(null);
    }
  };

  const killProcess = async (signal: "term" | "kill") => {
    if (!conn.pid) return;
    if (!confirm(`Send SIG${signal.toUpperCase()} til ${conn.process} (pid ${conn.pid})? Appen vil afslutte.`)) return;
    setActionPending(`kill_${signal}`);
    setActionResult(null);
    try {
      const res = await fetch("/api/firewall/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pid: conn.pid,
          process: conn.process,
          signal,
          raddr: conn.raddr,
          rport: conn.rport,
          reason: `inspect-panel·${data?.risk.band ?? "?"}`,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; hint?: string };
      setActionResult(
        json.ok
          ? `✓ SIG${signal.toUpperCase()} sendt til pid ${conn.pid}`
          : `fejl: ${json.error ?? `HTTP ${res.status}`}${json.hint ? ` · ${json.hint}` : ""}`
      );
    } catch (e) {
      setActionResult("fejl: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionPending(null);
    }
  };

  if (loading) return <div className="p-4 text-[11px] text-neutral-600 font-mono">indlæser inspect...</div>;
  if (error) return <div className="p-4 text-[11px] text-[#d87373] font-mono">fejl: {error}</div>;
  if (!data) return null;

  const riskTone =
    data.risk.band === "high" ? "text-[#d87373] border-[#d87373]/40 bg-[#d87373]/5" :
    data.risk.band === "medium" ? "text-amber-400 border-amber-500/40 bg-amber-500/5" :
    "text-[#7dd67d] border-[#7dd67d]/40 bg-[#7dd67d]/5";

  return (
    <div className="p-4 font-mono text-[11px] space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="text-neutral-300">
          <span className="text-neutral-500">{conn.process}</span>
          <span className="text-neutral-700 mx-2">·</span>
          <span>{conn.rhost ?? conn.raddr}</span>
          {conn.rport && <span className="text-neutral-500">:{conn.rport}</span>}
        </div>
        <button onClick={onClose} className="text-neutral-600 hover:text-neutral-300 text-[10px]">[luk]</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Risk panel */}
        <div className={"border rounded-sm p-3 " + riskTone}>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider opacity-60">risiko</span>
            <span className="text-[18px] tabular-nums">
              {data.risk.score}<span className="text-[10px] opacity-60">/100</span>
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-wider mb-2 opacity-80">{data.risk.band}</div>
          <div className="space-y-1">
            {data.risk.factors.length === 0 ? (
              <div className="text-[10px] opacity-60">ingen signaler — neutral</div>
            ) : (
              data.risk.factors.map((f, i) => (
                <div key={i} className="text-[10px] flex items-start gap-2">
                  <span className={"tabular-nums " + (f.weight > 0 ? "text-[#d87373]" : "text-[#7dd67d]")} style={{ minWidth: 28 }}>
                    {f.weight > 0 ? "+" : ""}{f.weight}
                  </span>
                  <span className="opacity-80">{f.reason}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Network/identitet panel */}
        <div className="border border-neutral-900 rounded-sm p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-600 mb-2">netværk</div>
          <div className="space-y-1.5 text-[11px]">
            <Field label="server">
              {data.geo?.country ? (
                <>
                  {flagEmoji(data.geo.country_code ?? "")} {data.geo.city ?? "—"}, {data.geo.country}
                </>
              ) : (
                <span className="text-neutral-700">— (geo cache opdaterer)</span>
              )}
            </Field>
            <Field label="isp/asn">
              <span className="text-neutral-300">{data.geo?.isp ?? data.geo?.asn_org ?? "—"}</span>
              {data.geo?.asn && <span className="text-neutral-700 ml-1">({data.geo.asn})</span>}
            </Field>
            <Field label="port">
              <span>{data.port.number ?? "—"}</span>
              {data.port.service && <span className="text-neutral-500 ml-2">{data.port.service}</span>}
              {data.port.secure === false && <span className="text-amber-400 ml-2 text-[10px]">⚠ ukrypteret</span>}
              {data.port.secure === true && <span className="text-[#7dd67d] ml-2 text-[10px]">✓ krypteret</span>}
            </Field>
            <Field label="vpn">
              {data.vpn.isVpn ? (
                <span className="text-[#7dd67d]">via {data.vpn.provider}</span>
              ) : (
                <span className="text-neutral-700">direkte (ingen VPN)</span>
              )}
            </Field>
            {data.vpn.signals.length > 0 && (
              <div className="text-[10px] text-neutral-600 pl-[60px]">
                {data.vpn.signals.map((s, i) => <div key={i}>· {s}</div>)}
              </div>
            )}
          </div>
        </div>

        {/* Tracker/identitet panel */}
        <div className="border border-neutral-900 rounded-sm p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-600 mb-2">identitet (DDG Tracker Radar)</div>
          {!data.tracker.isKnown ? (
            <div className="text-[11px] text-neutral-500">
              Ukendt host i DDG Tracker Radar.
              <div className="text-neutral-700 text-[10px] mt-1">
                — ny host, privat service, eller ikke-tracker server.
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 text-[11px]">
              <Field label="ejer">{data.tracker.ownerDisplay ?? data.tracker.owner ?? "—"}</Field>
              {data.tracker.categories && (
                <Field label="kategori">
                  <span className="text-neutral-300">{data.tracker.categories.join(", ")}</span>
                </Field>
              )}
              {typeof data.tracker.prevalence === "number" && (
                <Field label="prevalence">
                  <span className="text-neutral-300">{(data.tracker.prevalence * 100).toFixed(1)}%</span>
                  <span className="text-neutral-700 ml-2 text-[10px]">af det åbne web</span>
                </Field>
              )}
              {typeof data.tracker.fingerprinting === "number" && data.tracker.fingerprinting > 0 && (
                <Field label="fingerprint">
                  <span className={data.tracker.fingerprinting >= 2 ? "text-[#d87373]" : "text-amber-400"}>
                    {data.tracker.fingerprinting}/3
                  </span>
                </Field>
              )}
              <Field label="ddg-default">
                <span className={data.tracker.defaultAction === "block" ? "text-[#d87373]" : "text-neutral-400"}>
                  {data.tracker.defaultAction ?? "ignore"}
                </span>
              </Field>
              <Field label="klasse">
                {data.tracker.isTracker ? (
                  <span className="text-[#d87373]">tracker</span>
                ) : (
                  <span className="text-neutral-400">{data.tracker.classification}</span>
                )}
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* Recent traffic + other-procs */}
      {(data.recent.flow_count_24h > 0 || data.recent.other_processes.length > 0) && (
        <div className="border border-neutral-900 rounded-sm p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-600 mb-2">historik · sidste 24h</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
            <Stat label="flows" value={data.recent.flow_count_24h.toString()} />
            <Stat label="bytes" value={data.recent.bytes_24h > 0 ? formatBytes(data.recent.bytes_24h) : "—"} />
            <Stat label="første set" value={data.recent.first_seen ? timeSince(data.recent.first_seen) + " siden" : "—"} />
            <Stat label="sidste set" value={data.recent.last_seen ? timeSince(data.recent.last_seen) + " siden" : "—"} />
          </div>
          {data.recent.other_processes.length > 0 && (
            <div className="mt-3 text-[10px] text-neutral-500">
              <span className="text-neutral-600 uppercase tracking-wider">andre procs til samme host:</span>
              <div className="mt-1 text-neutral-300">{data.recent.other_processes.join(", ")}</div>
            </div>
          )}
        </div>
      )}

      {/* LLM-explain (lazy) */}
      <div className="border border-neutral-900 rounded-sm p-3">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-neutral-600">llm-forklaring</span>
          {!data.llm && (
            <button
              onClick={() => void runInspect(true)}
              disabled={llmRunning}
              className="text-sky-400 hover:text-sky-300 disabled:opacity-50 text-[10px]"
            >
              {llmRunning ? "henter (5-30s)..." : "↻ kør LLM-forklaring"}
            </button>
          )}
          {data.llm?.cached && <span className="text-neutral-700 text-[10px]">(cached)</span>}
        </div>
        {data.llm ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline gap-3 text-[10px] text-neutral-500">
              <span>kategori: <span className="text-neutral-300">{data.llm.category}</span></span>
              <span>·</span>
              <span>trust: <span className={data.llm.trust_score >= 7 ? "text-[#7dd67d]" : data.llm.trust_score >= 4 ? "text-amber-400" : "text-[#d87373]"}>{data.llm.trust_score}/10</span></span>
            </div>
            <div className="text-neutral-200 leading-relaxed">{data.llm.summary}</div>
            {data.llm.sources && data.llm.sources.length > 0 && (
              <div className="text-[10px] text-neutral-600 truncate">
                kilder: {data.llm.sources.slice(0, 3).join(" · ")}
              </div>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-neutral-700">
            Klik "kør LLM-forklaring" for kontekstuelt svar — bruger LM Studio + web-search.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border border-neutral-900 rounded-sm p-3">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-neutral-600">handlinger</span>
          {actionResult && (
            <span className={actionResult.startsWith("✓") ? "text-[#7dd67d] text-[10px]" : "text-[#d87373] text-[10px]"}>
              {actionResult}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={!canEnforce || actionPending !== null}
            tone="danger"
            onClick={blockHost}
            label={
              actionPending === "block_host"
                ? "blokerer..."
                : `✕ Bloker ${conn.rhost ?? conn.raddr}${conn.rport ? `:${conn.rport}` : ""}`
            }
            hint={!canEnforce ? "kræver lulu-cli + sudoers" : `tilføj LuLu-regel for ${conn.process}`}
          />
          <ActionButton
            disabled={!conn.pid || actionPending !== null}
            tone="warn"
            onClick={() => killProcess("term")}
            label={actionPending === "kill_term" ? "afslutter..." : `⏻ Afslut ${conn.process} (SIGTERM)`}
            hint="appen får chance for clean shutdown"
          />
          <ActionButton
            disabled={!conn.pid || actionPending !== null}
            tone="danger"
            onClick={() => killProcess("kill")}
            label={actionPending === "kill_kill" ? "afslutter..." : `⏻⏻ Force kill (SIGKILL)`}
            hint="hård afslutning — brug kun hvis SIGTERM ikke virker"
          />
        </div>

        {/* Batch-block: vis hvis recommendations indeholder block_batch */}
        {data.recommendations.some((r) => r.action === "block_batch") && canEnforce && (
          <div className="mt-3 border border-amber-500/30 bg-amber-500/5 rounded-sm p-3">
            <BatchBlockSection
              conn={conn}
              recommendations={data.recommendations.filter((r) => r.action === "block_batch")}
              onResult={(msg) => setActionResult(msg)}
            />
          </div>
        )}

        {data.recommendations.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-600 mb-1">anbefalinger</div>
            <div className="space-y-1">
              {data.recommendations.map((r, i) => (
                <div key={i} className="text-[10px] flex items-start gap-2">
                  <span className={r.destructive ? "text-amber-400" : "text-[#7dd67d]"} style={{ minWidth: 80 }}>
                    {r.action}
                  </span>
                  <div>
                    <div className="text-neutral-300">{r.label}</div>
                    <div className="text-neutral-600">{r.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blocklist-status — vis hvis host matcher en åben blocklist */}
        {data.blocklist.blocked && (
          <div className="mt-3 text-[10px] text-amber-400 font-mono">
            ⚠ Match i åben blocklist: <span className="text-neutral-300">{data.blocklist.matchedDomain}</span>
            {data.blocklist.source && <span className="text-neutral-700"> (kilde: {data.blocklist.source})</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function BatchBlockSection({
  conn,
  recommendations,
  onResult,
}: {
  conn: ConnectionWithGeo;
  recommendations: InspectResult["recommendations"];
  onResult: (msg: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const rec = recommendations[0];
  const batch = rec.batch ?? [];

  const apply = async () => {
    if (!confirm(`Bloker ${batch.length} hosts for ${conn.process}? Dette opretter ${batch.length} LuLu-regler i ét move.`)) return;
    setRunning(true);
    try {
      const res = await fetch("/api/firewall/rules/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lulu_key: conn.bundle_id ?? conn.process,
          exec_path: conn.exec_path ?? "*",
          process: conn.process,
          hosts: batch,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; added?: number; failed?: number; error?: string };
      if (json.ok) {
        onResult(`✓ ${json.added} regler tilføjet · ${json.failed ?? 0} fejlede`);
      } else {
        onResult(`fejl: ${json.error ?? `HTTP ${res.status}`}`);
      }
    } catch (e) {
      onResult("fejl: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[11px] text-amber-400 font-medium">{rec.label}</div>
          <div className="text-[10px] text-neutral-500 mt-1">{rec.reason}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-neutral-500 hover:text-neutral-300"
          >
            {expanded ? "skjul" : `vis ${batch.length} hosts`}
          </button>
          <button
            onClick={apply}
            disabled={running}
            className="text-[11px] px-3 py-1 border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 rounded-sm disabled:opacity-50"
          >
            {running ? "blokerer..." : `✕ Bloker alle ${batch.length}`}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 max-h-64 overflow-y-auto border-t border-amber-500/20 pt-2">
          <div className="space-y-0.5 text-[10px] font-mono">
            {batch.map((b, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span
                  className={
                    "text-[10px] " +
                    (b.reason === "DDG-tracker" ? "text-[#d87373]" : "text-amber-400")
                  }
                  style={{ minWidth: 80 }}
                >
                  {b.reason}
                </span>
                <span className="text-neutral-300 truncate">{b.host}</span>
                <span className="text-neutral-700 text-[10px]">{b.raddr}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-neutral-600 text-[10px] uppercase tracking-wider" style={{ minWidth: 56 }}>{label}</span>
      <span className="text-neutral-200 flex-1">{children}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-600">{label}</div>
      <div className="text-neutral-200 tabular-nums">{value}</div>
    </div>
  );
}

function ActionButton({
  label,
  hint,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  tone: "danger" | "warn" | "safe";
  disabled?: boolean;
  onClick: () => void;
}) {
  const cls =
    tone === "danger"
      ? "border-[#d87373]/40 text-[#d87373] hover:bg-[#d87373]/10"
      : tone === "warn"
      ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
      : "border-[#7dd67d]/40 text-[#7dd67d] hover:bg-[#7dd67d]/10";
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={hint}
      className={"px-3 py-1.5 text-[11px] border rounded-sm disabled:opacity-30 disabled:cursor-not-allowed " + cls}
    >
      {label}
    </button>
  );
}

// ── ExplainButton + ExplainCard ──────────────────────────────────────────────

function ExplainButton({ host, app }: { host: string; app: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ExplanationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (data) {
      setOpen((v) => !v);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/firewall/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, app }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ExplanationResult;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="relative">
      <button
        onClick={run}
        disabled={loading}
        className="text-[10px] text-sky-400 hover:text-sky-300 disabled:opacity-50"
        title={`Forklar ${host}`}
      >
        {loading ? "…" : "? forklar"}
      </button>
      {open && (data || error) && (
        <div
          onClick={() => setOpen(false)}
          className="absolute right-0 z-10 mt-1 p-3 bg-neutral-950 border border-neutral-800 rounded-sm shadow-lg w-[320px] text-left"
          style={{ fontFamily: "inherit" }}
        >
          {error ? (
            <div className="text-[#d87373] text-[11px]">{error}</div>
          ) : data ? (
            <ExplanationContent host={host} app={app} data={data} />
          ) : null}
        </div>
      )}
    </span>
  );
}

function ExplanationContent({ host, app, data }: { host: string; app: string; data: ExplanationResult }) {
  const trustColor =
    data.trust_score >= 8 ? "text-[#7dd67d]" :
    data.trust_score >= 5 ? "text-amber-400" :
    "text-[#d87373]";
  return (
    <div className="text-[11px] space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-neutral-300 truncate">{host}</span>
        <span className={trustColor + " text-[10px]"}>trust {data.trust_score}/10</span>
      </div>
      <div className="text-[10px] text-neutral-600">
        <span className="text-neutral-500">{app}</span> · kategori: {data.category}
        {data.cached && <span className="ml-1 text-neutral-700">(cached)</span>}
      </div>
      <div className="text-neutral-200 leading-snug">{data.summary}</div>
      {data.sources && data.sources.length > 0 && (
        <div className="text-[10px] text-neutral-600 truncate">
          kilder: {data.sources.slice(0, 3).join(" · ")}
        </div>
      )}
    </div>
  );
}

// ── Rules tab ────────────────────────────────────────────────────────────────

function RulesTab() {
  const { data, error } = usePoll<{ rules: NetRuleRow[]; luluAvailable: boolean; syncedAt: number | null }>(
    "/api/firewall/rules",
    8000
  );
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [reloadStatus, setReloadStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");

  const remove = async (id: number) => {
    if (!confirm("Slet regel? Hvis kilden er LuLu, slettes den også der.")) return;
    setPendingDelete(id);
    try {
      const res = await fetch(`/api/firewall/rules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        alert(`Fejl: ${err.error ?? `HTTP ${res.status}`}`);
      }
    } finally {
      setPendingDelete(null);
    }
  };

  const reload = async () => {
    setReloadStatus("loading");
    try {
      const res = await fetch("/api/firewall/lulu-reload", { method: "POST" });
      setReloadStatus(res.ok ? "ok" : "err");
      setTimeout(() => setReloadStatus("idle"), 3000);
    } catch {
      setReloadStatus("err");
    }
  };

  const grouped = useMemo(() => {
    if (!data?.rules) return new Map<string, NetRuleRow[]>();
    const m = new Map<string, NetRuleRow[]>();
    for (const r of data.rules) {
      const list = m.get(r.lulu_key) ?? [];
      list.push(r);
      m.set(r.lulu_key, list);
    }
    return m;
  }, [data]);

  return (
    <Section
      title="firewall-regler"
      right={
        <span>
          {data?.luluAvailable === false ? (
            <span className="text-[#d87373]"><Dot tone="bad" />LuLu CLI mangler</span>
          ) : (
            <>
              <span>{data?.rules.length ?? 0} regler</span>
              <span className="text-neutral-700 mx-2">·</span>
              <button
                onClick={reload}
                disabled={reloadStatus === "loading"}
                className="text-sky-400 hover:text-sky-300 disabled:opacity-50"
              >
                {reloadStatus === "loading" ? "reloading…" :
                 reloadStatus === "ok" ? "✓ reloaded" :
                 reloadStatus === "err" ? "fejl" : "↻ reload lulu"}
              </button>
            </>
          )}
        </span>
      }
    >
      {error && <div className="text-[11px] text-[#d87373] mb-2">fejl: {error.message}</div>}

      {data?.luluAvailable === false && (
        <div className="text-[11px] text-neutral-500 leading-relaxed border border-neutral-900 rounded-sm p-3 mb-4">
          LuLu CLI ikke fundet. Installer for at få regelstyring fra Skynet:
          <div className="mt-2 text-neutral-700 font-mono">
            brew install woop/tap/lulu-cli
            <br />
            sudo scripts/install-lulu-sudoers.sh
          </div>
          <div className="mt-2">
            Skynet's /firewall side kører i monitor-mode uden — du ser stadig forbindelser, men kan ikke blokere.
          </div>
        </div>
      )}

      {grouped.size === 0 ? (
        <div className="text-neutral-700 text-[12px] text-center py-8">ingen regler</div>
      ) : (
        <div className="space-y-3">
          {[...grouped.entries()].map(([key, rules]) => (
            <div key={key} className="border border-neutral-900 rounded-sm">
              <div className="px-3 py-2 border-b border-neutral-900 bg-neutral-950/50 font-mono text-[11px] flex items-baseline gap-2">
                <span className="text-neutral-300 font-medium">{rules[0].process ?? key}</span>
                <span className="text-neutral-700">·</span>
                <span className="text-neutral-600 text-[10px] truncate flex-1">{rules[0].exec_path ?? key}</span>
                <span className="text-neutral-700 text-[10px]">{rules.length} regel{rules.length !== 1 ? "r" : ""}</span>
              </div>
              <div className="divide-y divide-neutral-900">
                {rules.map((r) => (
                  <div key={r.id} className="px-3 py-1.5 font-mono text-[11px] flex items-center gap-2">
                    <span
                      className={
                        r.action === "allow" ? "text-[#7dd67d] w-12" :
                        r.action === "block" ? "text-[#d87373] w-12" :
                        "text-amber-400 w-12"
                      }
                    >
                      [{r.action}]
                    </span>
                    <span className="text-neutral-500 w-16 text-[10px]">{r.scope}</span>
                    <span className="text-neutral-300 flex-1 truncate">
                      {r.remote_host ?? "*"}{r.remote_port ? `:${r.remote_port}` : ""}
                    </span>
                    <span className="text-neutral-700 text-[10px] uppercase tracking-wide">{r.source}</span>
                    <button
                      onClick={() => remove(r.id)}
                      disabled={pendingDelete === r.id}
                      className="text-[10px] text-neutral-500 hover:text-[#d87373] disabled:opacity-50"
                      title="Slet regel"
                    >
                      {pendingDelete === r.id ? "…" : "✕"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Profiles tab ─────────────────────────────────────────────────────────────

interface ProfilesPayload {
  profiles: NetProfileRow[];
  activeId: number | null;
  currentSsid: string | null;
}

function ProfilesTab() {
  const { data, error } = usePoll<ProfilesPayload>("/api/firewall/profiles", 10_000);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [ssidPattern, setSsidPattern] = useState("");
  const [trust, setTrust] = useState<"high" | "normal" | "low">("normal");
  const [pendingActivate, setPendingActivate] = useState<number | null>(null);
  const [activateMsg, setActivateMsg] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    await fetch("/api/firewall/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        ssid_pattern: ssidPattern.trim() || null,
        trust_level: trust,
      }),
    });
    setName("");
    setSsidPattern("");
    setTrust("normal");
    setCreating(false);
  };

  const activate = async (id: number) => {
    setPendingActivate(id);
    setActivateMsg(null);
    try {
      const res = await fetch(`/api/firewall/profiles/${id}/activate`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; rulesAdded?: number; rulesRemoved?: number; warnings?: string[]; error?: string };
      if (json.ok) {
        setActivateMsg(`Aktiveret: +${json.rulesAdded} -${json.rulesRemoved} regler${json.warnings && json.warnings.length ? ` · ⚠ ${json.warnings.length} advarsler` : ""}`);
      } else {
        setActivateMsg(`Fejl: ${json.error ?? "ukendt"}`);
      }
    } finally {
      setPendingActivate(null);
      setTimeout(() => setActivateMsg(null), 5000);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Slet profil?")) return;
    await fetch(`/api/firewall/profiles/${id}`, { method: "DELETE" });
  };

  const suggest = async () => {
    if (!data?.currentSsid) {
      alert("Ingen Wi-Fi forbundet — kan ikke foreslå profil");
      return;
    }
    const res = await fetch("/api/firewall/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: `__suggest_profile__:${data.currentSsid}` }),
    }).catch(() => null);
    // Fallback: brug agent-tool direkte via /api/siri
    if (!res || !res.ok) {
      try {
        const r2 = await fetch("/api/siri", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: `Foreslå firewall-profil for SSID '${data.currentSsid}'` }),
        });
        const txt = await r2.text();
        alert("Forslag fra agent:\n\n" + txt.slice(0, 500));
      } catch (e) {
        alert("Kunne ikke hente forslag: " + (e instanceof Error ? e.message : String(e)));
      }
    }
  };

  return (
    <Section
      title="firewall-profiler"
      right={
        <span>
          {data?.currentSsid ? (
            <>
              <span className="text-neutral-500">ssid:</span>{" "}
              <span className="text-neutral-200">{data.currentSsid}</span>
            </>
          ) : (
            <span className="text-neutral-700">no wi-fi</span>
          )}
          <span className="text-neutral-700 mx-2">·</span>
          <button onClick={() => setCreating((v) => !v)} className="text-sky-400 hover:text-sky-300">
            {creating ? "annuller" : "+ ny profil"}
          </button>
        </span>
      }
    >
      {error && <div className="text-[11px] text-[#d87373] mb-2">fejl: {error.message}</div>}
      {activateMsg && <div className="text-[11px] text-amber-400 mb-3 font-mono">{activateMsg}</div>}

      {creating && (
        <div className="border border-neutral-900 rounded-sm p-3 mb-4 font-mono text-[11px] space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-sm text-neutral-100"
              placeholder="navn (fx 'Hjemme', 'Café', 'Lufthavn')"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-sm text-neutral-100"
              placeholder="ssid-pattern (fx 'TDC-*' eller eksakt SSID)"
              value={ssidPattern}
              onChange={(e) => setSsidPattern(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-neutral-500">trust:</span>
            {(["high", "normal", "low"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1 cursor-pointer">
                <input type="radio" checked={trust === t} onChange={() => setTrust(t)} />
                {t}
              </label>
            ))}
            <button onClick={create} className="ml-auto text-sky-400 hover:text-sky-300">opret →</button>
          </div>
        </div>
      )}

      <div className="mb-3">
        <button onClick={suggest} className="text-[11px] text-sky-400 hover:text-sky-300">
          ⚡ foreslå profil for nuværende Wi-Fi
        </button>
      </div>

      {!data?.profiles.length ? (
        <div className="text-neutral-700 text-[12px] text-center py-8">ingen profiler defineret</div>
      ) : (
        <div className="space-y-2">
          {data.profiles.map((p) => {
            const isActive = data.activeId === p.id;
            const trustTone =
              p.trust_level === "high" ? "text-[#7dd67d]" :
              p.trust_level === "low" ? "text-[#d87373]" : "text-amber-400";
            return (
              <div
                key={p.id}
                className={
                  "border rounded-sm p-3 font-mono text-[11px] " +
                  (isActive ? "border-[#7dd67d] bg-[#7dd67d]/5" : "border-neutral-900")
                }
              >
                <div className="flex items-baseline gap-2">
                  {isActive && <Dot tone="ok" />}
                  <span className="text-neutral-100 font-medium">{p.name}</span>
                  <span className={trustTone + " text-[10px]"}>[{p.trust_level}]</span>
                  {p.ssid_pattern && (
                    <span className="text-neutral-500">· ssid: {p.ssid_pattern}</span>
                  )}
                  <span className="ml-auto flex gap-3">
                    {!isActive && (
                      <button
                        onClick={() => activate(p.id)}
                        disabled={pendingActivate === p.id}
                        className="text-sky-400 hover:text-sky-300 disabled:opacity-50"
                      >
                        {pendingActivate === p.id ? "..." : "aktivér"}
                      </button>
                    )}
                    <button onClick={() => remove(p.id)} className="text-neutral-500 hover:text-[#d87373]">slet</button>
                  </span>
                </div>
                {(p.description || p.llm_summary) && (
                  <div className="mt-1 text-neutral-500">{p.description ?? p.llm_summary}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── Stats tab (Map + suspicious) ─────────────────────────────────────────────

interface StatsCountry {
  country: string;
  country_code: string;
  flow_count: number;
  unique_processes: string[];
}

interface SuspiciousReportData {
  hours: number;
  generated_at: number | null;
  summary: string;
  llm_summary?: string;
  signals?: {
    new_apps: Array<{ process: string; raddr: string | null; ts: number }>;
    high_risk_countries: Array<{ country: string; flow_count: number; processes: string[] }>;
    fanout_processes: Array<{ process: string; unique_remotes: number }>;
    rare_isps: Array<{ isp: string; flow_count: number; processes: string[] }>;
  };
}

function StatsTab() {
  const { data: conns } = usePoll<{ connections: ConnectionWithGeo[] }>(
    "/api/firewall/connections?limit=1000&since=now-1h&dedup=1",
    15_000
  );
  const { data: suspicious } = usePoll<SuspiciousReportData>("/api/firewall/suspicious", 30_000);
  const [running, setRunning] = useState(false);

  const generate = async () => {
    setRunning(true);
    try {
      await fetch("/api/firewall/suspicious", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: 24 }),
      });
    } finally {
      setRunning(false);
    }
  };

  const countryStats: StatsCountry[] = useMemo(() => {
    if (!conns?.connections) return [];
    const map = new Map<string, { country: string; flows: number; procs: Set<string> }>();
    for (const c of conns.connections) {
      if (!c.country_code) continue;
      const entry = map.get(c.country_code) ?? { country: c.country_code, flows: 0, procs: new Set() };
      entry.flows += 1;
      entry.procs.add(c.process);
      map.set(c.country_code, entry);
    }
    return [...map.entries()]
      .map(([cc, v]) => ({
        country: v.country,
        country_code: cc,
        flow_count: v.flows,
        unique_processes: [...v.procs],
      }))
      .sort((a, b) => b.flow_count - a.flow_count);
  }, [conns]);

  const procBytes = useMemo(() => {
    if (!conns?.connections) return [];
    const map = new Map<string, number>();
    for (const c of conns.connections) {
      map.set(c.process, (map.get(c.process) ?? 0) + c.bytes_in + c.bytes_out);
    }
    return [...map.entries()]
      .filter(([, b]) => b > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [conns]);

  const maxBytes = procBytes[0]?.[1] ?? 1;
  const totalCountries = countryStats.length;
  const totalFlows = countryStats.reduce((s, c) => s + c.flow_count, 0);

  return (
    <div className="space-y-6">
      <Section
        title="trafik per land · sidste 1 time"
        right={<span>{totalCountries} lande · {totalFlows} flows</span>}
      >
        {countryStats.length === 0 ? (
          <div className="text-neutral-700 text-[12px] text-center py-8">ingen geo-data endnu — lookups sker i baggrunden</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {countryStats.map((c) => {
              const pct = (c.flow_count / Math.max(1, totalFlows)) * 100;
              return (
                <div
                  key={c.country_code}
                  className="border border-neutral-900 rounded-sm p-2 font-mono text-[11px]"
                  title={c.unique_processes.slice(0, 8).join("\n")}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[16px]">{flagEmoji(c.country_code)}</span>
                    <span className="text-neutral-500 text-[10px]">{c.country_code}</span>
                  </div>
                  <div className="mt-1 text-neutral-200 tabular-nums">{c.flow_count}</div>
                  <div className="text-neutral-700 text-[10px]">{pct.toFixed(0)}% · {c.unique_processes.length} apps</div>
                  <div className="mt-1 h-1 bg-neutral-900 rounded-sm overflow-hidden">
                    <div className="h-full bg-sky-500/40" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="bytes per app · sidste 1 time" right={<span>{procBytes.length} apps med data</span>}>
        {procBytes.length === 0 ? (
          <div className="text-neutral-700 text-[12px] text-center py-8">ingen byte-deltas endnu — vent et minut</div>
        ) : (
          <div className="space-y-1.5 font-mono text-[11px]">
            {procBytes.map(([proc, bytes]) => {
              const pct = (bytes / maxBytes) * 100;
              return (
                <div key={proc} className="grid grid-cols-[160px_1fr_auto] items-center gap-3">
                  <span className="text-neutral-200 truncate">{truncate(proc, 22)}</span>
                  <span className="h-2 bg-neutral-900 rounded-sm overflow-hidden">
                    <span className="block h-full bg-sky-500/50" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-neutral-500 tabular-nums text-right" style={{ minWidth: 70 }}>
                    {formatBytes(bytes)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="mistænkelig aktivitet"
        right={
          <button
            onClick={generate}
            disabled={running}
            className="text-sky-400 hover:text-sky-300 disabled:opacity-50"
          >
            {running ? "genererer…" : "↻ generér rapport"}
          </button>
        }
      >
        {!suspicious || !suspicious.generated_at ? (
          <div className="text-neutral-700 text-[12px] text-center py-8">
            ingen rapport endnu — klik "generér rapport" for at lave en (LLM-baseret, tager 10-30s)
          </div>
        ) : (
          <div className="space-y-3 font-mono text-[11px]">
            <div className="text-[10px] text-neutral-600">
              genereret {timeSince(suspicious.generated_at)} · {suspicious.hours}h vindue
            </div>
            <div className="text-neutral-300">{suspicious.summary}</div>
            {suspicious.llm_summary && (
              <div className="border border-neutral-900 rounded-sm p-3 text-neutral-200 leading-relaxed">
                {suspicious.llm_summary}
              </div>
            )}
            {suspicious.signals && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <SignalCard
                  title="nye apps"
                  count={suspicious.signals.new_apps.length}
                  items={suspicious.signals.new_apps.slice(0, 5).map((a) => `${a.process} → ${a.raddr ?? "?"}`)}
                />
                <SignalCard
                  title="high-risk lande"
                  count={suspicious.signals.high_risk_countries.length}
                  items={suspicious.signals.high_risk_countries.map((c) => `${flagEmoji(c.country)} ${c.country} · ${c.flow_count} flows`)}
                />
                <SignalCard
                  title="fanout-processer"
                  count={suspicious.signals.fanout_processes.length}
                  items={suspicious.signals.fanout_processes.map((f) => `${f.process} · ${f.unique_remotes} unique`)}
                />
                <SignalCard
                  title="sjældne ISPs"
                  count={suspicious.signals.rare_isps.length}
                  items={suspicious.signals.rare_isps.slice(0, 5).map((r) => `${r.isp} · ${r.flow_count}`)}
                />
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function SignalCard({ title, count, items }: { title: string; count: number; items: string[] }) {
  return (
    <div className="border border-neutral-900 rounded-sm p-2">
      <div className="flex items-baseline justify-between text-[10px] text-neutral-600 uppercase tracking-wider mb-1">
        <span>{title}</span>
        <span className="text-neutral-300 tabular-nums">{count}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-neutral-700 text-[10px]">—</div>
      ) : (
        <div className="space-y-0.5 text-[10px] text-neutral-500">
          {items.map((s, i) => (
            <div key={i} className="truncate" title={s}>{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Apps tab — per-app health-score (DDG TDS + blocklists) ──────────────────

interface AppHealthRow {
  process: string;
  bundle_id: string | null;
  exec_path: string | null;
  total_flows: number;
  unique_hosts: number;
  tracker_flows: number;
  unique_trackers: number;
  blocklist_flows: number;
  high_risk_events: number;
  total_bytes: number;
  tracker_ratio: number;
  grade: "A" | "B" | "C" | "D" | "F";
  score: number;
  top_trackers: Array<{ host: string; flow_count: number; owner?: string }>;
  blocklist_examples: Array<{ host: string; flow_count: number }>;
}

interface BlocklistStatus {
  loaded: boolean;
  loadedAt: number | null;
  totalDomains: number;
  lists: Array<{ sourceId: string; name: string; count: number; loadedAt: number }>;
  sources: Array<{ id: string; name: string; url: string; description: string }>;
}

interface AlertsStatus {
  running: boolean;
  enabled: boolean;
  threshold: number;
  lastTickAt: number | null;
  lastNotifiedAt: number | null;
  alertsSent: number;
}

function AppsTab() {
  const [hours, setHours] = useState(168);
  const { data, error } = usePoll<{ apps: AppHealthRow[] }>(`/api/firewall/app-health?hours=${hours}`, 30_000);
  const { data: bl } = usePoll<BlocklistStatus>("/api/firewall/blocklists", 60_000);
  const { data: alerts } = usePoll<AlertsStatus>("/api/firewall/alerts", 10_000);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  const refreshList = async (sourceId?: string) => {
    setRefreshing(sourceId ?? "all");
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/firewall/blocklists/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceId ? { sourceId } : {}),
      });
      const json = (await res.json()) as { results?: Array<{ count: number; ok: boolean; sourceId: string }> } & { count?: number };
      if (json.results) {
        const total = json.results.reduce((s, r) => s + (r.ok ? r.count : 0), 0);
        setRefreshMsg(`✓ Hentet ${total.toLocaleString("da-DK")} domæner fra ${json.results.length} kilder`);
      } else {
        setRefreshMsg(`✓ Hentet ${(json.count ?? 0).toLocaleString("da-DK")} domæner`);
      }
    } catch (e) {
      setRefreshMsg("fejl: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRefreshing(null);
      setTimeout(() => setRefreshMsg(null), 6000);
    }
  };

  const toggleAlerts = async (enabled: boolean) => {
    await fetch("/api/firewall/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  };

  const setThreshold = async (threshold: number) => {
    await fetch("/api/firewall/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threshold }),
    });
  };

  return (
    <div className="space-y-6">
      {/* Alerts-toggle */}
      <Section title="high-risk push-notifikationer" right={<span>{alerts?.alertsSent ?? 0} sendt</span>}>
        <div className="flex flex-wrap items-baseline gap-4 text-[11px] font-mono">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!alerts?.enabled}
              onChange={(e) => toggleAlerts(e.target.checked)}
            />
            <span className="text-neutral-300">aktivér push når risk ≥</span>
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={alerts?.threshold ?? 70}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded-sm text-neutral-100 w-16"
          />
          <span className="text-neutral-500">/100</span>
          {alerts?.lastNotifiedAt && (
            <span className="text-neutral-700">· sidste alert: {timeSince(alerts.lastNotifiedAt)} siden</span>
          )}
        </div>
        <div className="mt-2 text-[10px] text-neutral-700">
          Bruger eksisterende notify-stack (macOS · ntfy · Pushover). ntfy-action-button "Bloker host" kræver
          at <code className="text-neutral-500">skynet_public_url</code> er sat i settings (fx Tailscale-IP).
        </div>
      </Section>

      {/* Blocklists status */}
      <Section
        title="domain blocklists"
        right={
          <span>
            {bl?.totalDomains.toLocaleString("da-DK") ?? 0} domæner aktive
            <span className="text-neutral-700 mx-2">·</span>
            <button
              onClick={() => refreshList()}
              disabled={refreshing !== null}
              className="text-sky-400 hover:text-sky-300 disabled:opacity-50"
            >
              {refreshing === "all" ? "henter..." : "↻ refresh alle"}
            </button>
          </span>
        }
      >
        {refreshMsg && <div className="text-[11px] text-amber-400 mb-2 font-mono">{refreshMsg}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {bl?.sources?.map((src) => {
            const info = bl.lists?.find((l) => l.sourceId === src.id);
            return (
              <div key={src.id} className="border border-neutral-900 rounded-sm p-3 font-mono text-[11px]">
                <div className="flex items-baseline justify-between">
                  <span className="text-neutral-200 font-medium">{src.name}</span>
                  {info ? (
                    <span className="text-[#7dd67d] text-[10px]">✓</span>
                  ) : (
                    <span className="text-neutral-700 text-[10px]">ikke loaded</span>
                  )}
                </div>
                <div className="text-neutral-600 text-[10px] mt-1">{src.description}</div>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-neutral-300 tabular-nums">
                    {info ? info.count.toLocaleString("da-DK") + " domæner" : "—"}
                  </span>
                  <button
                    onClick={() => refreshList(src.id)}
                    disabled={refreshing !== null}
                    className="text-[10px] text-sky-400 hover:text-sky-300 disabled:opacity-50"
                  >
                    {refreshing === src.id ? "..." : "hent"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Per-app health */}
      <Section
        title={`apps · sidste ${hours === 24 ? "24h" : hours === 168 ? "7 dage" : `${hours}h`}`}
        right={
          <span className="font-mono">
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="bg-neutral-900 border border-neutral-800 text-neutral-300 text-[10px] px-2 py-0.5 rounded-sm"
            >
              <option value={24}>24h</option>
              <option value={168}>7 dage</option>
              <option value={720}>30 dage</option>
            </select>
            <span className="text-neutral-700 mx-2">·</span>
            <span>{data?.apps?.length ?? 0} apps</span>
          </span>
        }
      >
        {error && <div className="text-[#d87373] text-[11px] mb-2">fejl: {error.message}</div>}
        {!data?.apps?.length ? (
          <div className="text-neutral-700 text-[12px] text-center py-8">ingen data — vent et øjeblik mens collectoren samler flows</div>
        ) : (
          <div className="space-y-1">
            {data.apps.map((app) => {
              const expanded = expandedApp === app.process;
              return (
                <div
                  key={app.process}
                  className={
                    "border rounded-sm font-mono text-[11px] " +
                    (app.grade === "F" ? "border-[#d87373]/40" :
                     app.grade === "D" ? "border-amber-500/40" :
                     app.grade === "A" ? "border-[#7dd67d]/30" : "border-neutral-900")
                  }
                >
                  <button
                    onClick={() => setExpandedApp(expanded ? null : app.process)}
                    className="w-full px-3 py-2 flex items-baseline gap-3 text-left hover:bg-neutral-900/40"
                  >
                    <span className="text-neutral-600 inline-block w-3">{expanded ? "▾" : "▸"}</span>
                    <GradeBadge grade={app.grade} />
                    <span className="text-neutral-100 flex-1 truncate">{app.process}</span>
                    <span className="text-neutral-500 text-[10px] tabular-nums">{app.total_flows} flows</span>
                    <span className="text-neutral-500 text-[10px] tabular-nums">{app.unique_hosts} hosts</span>
                    <span className={
                      "text-[10px] tabular-nums " +
                      (app.unique_trackers > 0 ? "text-[#d87373]" : "text-neutral-700")
                    }>
                      {app.unique_trackers} trackers
                    </span>
                    <span className="text-neutral-700 text-[10px] tabular-nums" style={{ minWidth: 50 }}>
                      {app.tracker_ratio > 0 ? (app.tracker_ratio * 100).toFixed(1) + "%" : "—"}
                    </span>
                  </button>
                  {expanded && (
                    <div className="px-3 pb-3 border-t border-neutral-900 space-y-2">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
                        <Stat label="total flows" value={app.total_flows.toLocaleString("da-DK")} />
                        <Stat label="bytes" value={formatBytes(app.total_bytes)} />
                        <Stat label="tracker-ratio" value={(app.tracker_ratio * 100).toFixed(1) + "%"} />
                        <Stat label="high-risk events" value={app.high_risk_events.toString()} />
                      </div>
                      {app.bundle_id && (
                        <div className="text-[10px] text-neutral-600 truncate">
                          bundle: <span className="text-neutral-500">{app.bundle_id}</span>
                        </div>
                      )}
                      {app.top_trackers.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-neutral-600 mb-1">top trackers kontaktet</div>
                          <div className="space-y-0.5">
                            {app.top_trackers.map((t) => (
                              <div key={t.host} className="flex items-baseline gap-2">
                                <span className="text-[#d87373] tabular-nums" style={{ minWidth: 30 }}>{t.flow_count}×</span>
                                <span className="text-neutral-300 truncate flex-1">{t.host}</span>
                                {t.owner && <span className="text-neutral-700 text-[10px] truncate">{t.owner}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {app.blocklist_examples.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-neutral-600 mb-1">på blocklist</div>
                          <div className="space-y-0.5">
                            {app.blocklist_examples.map((b) => (
                              <div key={b.host} className="flex items-baseline gap-2">
                                <span className="text-amber-400 tabular-nums" style={{ minWidth: 30 }}>{b.flow_count}×</span>
                                <span className="text-neutral-300 truncate">{b.host}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function GradeBadge({ grade }: { grade: "A" | "B" | "C" | "D" | "F" }) {
  const tone =
    grade === "A" ? "text-[#7dd67d] bg-[#7dd67d]/10 border-[#7dd67d]/30" :
    grade === "B" ? "text-[#7dd67d]/80 bg-neutral-900 border-neutral-800" :
    grade === "C" ? "text-amber-400 bg-amber-500/10 border-amber-500/30" :
    grade === "D" ? "text-orange-400 bg-orange-500/10 border-orange-500/30" :
    "text-[#d87373] bg-[#d87373]/10 border-[#d87373]/30";
  return (
    <span className={"inline-block border px-1.5 py-0.5 rounded-sm text-[10px] font-bold tabular-nums w-5 text-center " + tone}>
      {grade}
    </span>
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
