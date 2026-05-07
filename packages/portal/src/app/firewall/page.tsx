"use client";
import { useEffect, useMemo, useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section, Dot, OkLabel, WarnLabel, BadLabel } from "@/components/minimal/primitives";
import { formatBytes, formatRate, timeSince, truncate } from "@/lib/formatters";
import type { FirewallSummary } from "@/lib/collectors/firewall";
import type { NetConnRow, NetEventRow, NetRuleRow } from "@/lib/firewall/store";
import type { LuluStatus } from "@/lib/firewall/lulu";
import type { NetProfileRow } from "@/lib/firewall/profiles";
import type { ExplanationResult } from "@/lib/firewall/explain";

type Tab = "live" | "rules" | "profiles" | "stats" | "events";

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
                <td className="py-1.5 pr-1 text-right whitespace-nowrap">
                  {c.raddr && c.state !== "LISTEN" && (
                    <ExplainButton host={c.rhost ?? c.raddr} app={c.process} />
                  )}
                  {canEnforce && c.raddr && c.state !== "LISTEN" ? (
                    <button
                      disabled={pendingBlock === c.process}
                      onClick={() => blockApp(c)}
                      className="text-[10px] text-[#d87373] hover:text-[#e69090] disabled:opacity-50 ml-2"
                      title={`Bloker ${c.process} → ${c.rhost ?? c.raddr}`}
                    >
                      {pendingBlock === c.process ? "…" : "✕ block"}
                    </button>
                  ) : null}
                </td>
              </tr>
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
