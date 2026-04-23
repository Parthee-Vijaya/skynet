"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

// ── Typer (synkront med src/lib/control/*.ts) ─────────────────────────────
interface ServiceStatus {
  label: string;
  name: string;
  description?: string;
  actions: Array<"start" | "stop" | "restart" | "status">;
  category?: string;
  loaded: boolean;
  running: boolean;
  pid: number | null;
  exitCode: number | null;
  plistPath: string | null;
}

interface AppStatus {
  name: string;
  bundleId?: string;
  icon?: string;
  category?: string;
  running: boolean;
}

type Tab = "services" | "apps";

const CATEGORY_ORDER: Record<string, number> = {
  core: 0,
  ai: 1,
  network: 2,
  dev: 3,
  media: 4,
  productivity: 5,
  system: 6,
  tools: 7,
};

function sortByCategory<T extends { category?: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ac = CATEGORY_ORDER[a.category ?? ""] ?? 99;
    const bc = CATEGORY_ORDER[b.category ?? ""] ?? 99;
    return ac - bc;
  });
}

export function ControlWidget() {
  const [tab, setTab] = useState<Tab>("services");
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [apps, setApps] = useState<AppStatus[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(0);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [sRes, aRes] = await Promise.all([
        fetch("/api/control/services", { cache: "no-store" }),
        fetch("/api/control/apps", { cache: "no-store" }),
      ]);
      if (sRes.ok) {
        const d = await sRes.json();
        setServices(sortByCategory(d.services ?? []));
      }
      if (aRes.ok) {
        const d = await aRes.json();
        setApps(sortByCategory(d.apps ?? []));
      }
      setLastRefresh(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "fejl ved refresh");
    }
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 15_000);
    return () => clearInterval(iv);
  }, [refresh]);

  const callService = async (
    label: string,
    action: "start" | "stop" | "restart"
  ) => {
    if (action === "stop" || action === "restart") {
      if (!confirm(`Er du sikker på at du vil ${action === "stop" ? "stoppe" : "genstarte"} ${label}?`))
        return;
    }
    setBusy(`service:${label}`);
    setError(null);
    try {
      const res = await fetch(`/api/control/services/${encodeURIComponent(label)}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(action !== "start" ? { "x-confirm": "true" } : {}),
        },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(`${label}: ${d.error ?? d.message ?? "fejl"}`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "netværksfejl");
    } finally {
      setBusy(null);
    }
  };

  const callApp = async (name: string, action: "launch" | "quit") => {
    if (action === "quit") {
      if (!confirm(`Afslut ${name}?`)) return;
    }
    setBusy(`app:${name}`);
    setError(null);
    try {
      const res = await fetch(`/api/control/apps/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(action === "quit" ? { "x-confirm": "true" } : {}),
        },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(`${name}: ${d.error ?? d.message ?? "fejl"}`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "netværksfejl");
    } finally {
      setBusy(null);
    }
  };

  const runningServices = services.filter((s) => s.running).length;
  const runningApps = apps.filter((a) => a.running).length;

  return (
    <Card
      widget="status"
      title="Mission control"
      className="sm:col-span-2 lg:col-span-6"
      action={
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-neutral-500">
            {lastRefresh ? `opdateret ${new Date(lastRefresh).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
          </span>
          <Link
            href="/control"
            title="Åbn filbrowser"
            className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-400/20 text-cyan-300/80 hover:border-cyan-400/50"
          >
            📁
          </Link>
          <Link
            href="/automations"
            title="Automations"
            className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-400/20 text-cyan-300/80 hover:border-cyan-400/50"
          >
            ⏱
          </Link>
          <Link
            href="/agents"
            title="Agents"
            className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-400/20 text-cyan-300/80 hover:border-cyan-400/50"
          >
            🧠
          </Link>
          <Link
            href="/delegate"
            title="Delegate til Claude"
            className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-400/20 text-cyan-300/80 hover:border-cyan-400/50"
          >
            🤖
          </Link>
          <button
            onClick={refresh}
            title="Genopfrisk"
            className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-400/20 text-cyan-300/80 hover:border-cyan-400/50"
          >
            ↻
          </button>
        </div>
      }
    >
      {/* Tabs + summary */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex gap-1 text-[11px] font-mono">
          <button
            onClick={() => setTab("services")}
            className={`px-3 py-1.5 rounded-md border transition-colors ${
              tab === "services"
                ? "bg-cyan-400/10 border-cyan-400/40 text-cyan-100"
                : "bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Services · <span className="text-emerald-400 font-semibold">{runningServices}</span>
            <span className="text-neutral-500">/{services.length}</span>
          </button>
          <button
            onClick={() => setTab("apps")}
            className={`px-3 py-1.5 rounded-md border transition-colors ${
              tab === "apps"
                ? "bg-cyan-400/10 border-cyan-400/40 text-cyan-100"
                : "bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Apps · <span className="text-emerald-400 font-semibold">{runningApps}</span>
            <span className="text-neutral-500">/{apps.length}</span>
          </button>
        </div>
        <div className="text-[10px] font-mono text-neutral-500 flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
            kører
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
            stoppet
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-2 px-2 py-1 rounded border border-rose-500/30 bg-rose-950/30 text-[11px] text-rose-300">
          {error}
        </div>
      )}

      {tab === "services" && (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {services.length === 0 ? (
            <div className="text-xs text-neutral-500 py-4 text-center">indlæser services…</div>
          ) : (
            services.map((s) => {
              const isBusy = busy === `service:${s.label}`;
              return (
                <div
                  key={s.label}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-md border transition-colors ${
                    s.running
                      ? "bg-emerald-500/10 border-emerald-400/30"
                      : s.loaded
                      ? "bg-amber-500/5 border-amber-400/20"
                      : "bg-neutral-900/40 border-transparent hover:border-cyan-400/15"
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      s.running
                        ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                        : s.loaded
                        ? "bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.5)]"
                        : "bg-neutral-600"
                    }`}
                    title={s.running ? `kører (pid ${s.pid})` : s.loaded ? "loaded" : "ikke loaded"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-sm truncate ${s.running ? "text-emerald-50 font-medium" : "text-neutral-100"}`}>
                        {s.name}
                      </span>
                      {s.running && (
                        <span className="text-[10px] font-mono text-emerald-400/80 shrink-0">
                          pid {s.pid}
                        </span>
                      )}
                      {!s.running && s.loaded && (
                        <span className="text-[10px] font-mono text-amber-400/80 shrink-0">
                          loaded
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <div className="text-[10px] text-neutral-500 truncate">
                        {s.description}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1 shrink-0">
                    {s.actions.includes("start") && !s.running && (
                      <button
                        disabled={isBusy}
                        onClick={() => callService(s.label, "start")}
                        className="px-2 py-1 rounded text-[10px] font-mono border border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-30"
                      >
                        start
                      </button>
                    )}
                    {s.actions.includes("stop") && s.running && (
                      <button
                        disabled={isBusy}
                        onClick={() => callService(s.label, "stop")}
                        className="px-2 py-1 rounded text-[10px] font-mono border border-rose-400/30 text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"
                      >
                        stop
                      </button>
                    )}
                    {s.actions.includes("restart") && s.running && (
                      <button
                        disabled={isBusy}
                        onClick={() => callService(s.label, "restart")}
                        className="px-2 py-1 rounded text-[10px] font-mono border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-30"
                      >
                        ↻
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "apps" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto pr-1">
          {apps.map((a) => {
            const isBusy = busy === `app:${a.name}`;
            return (
              <div
                key={a.name}
                className={`group relative px-2.5 py-2 rounded-md border flex items-center gap-2 transition-colors ${
                  a.running
                    ? "bg-emerald-500/15 border-emerald-400/40 shadow-[inset_0_0_12px_rgba(52,211,153,0.08)]"
                    : "bg-neutral-900/40 border-neutral-800/50 opacity-70 hover:opacity-100 hover:border-cyan-400/20"
                }`}
              >
                <div className="relative shrink-0">
                  <span className="text-lg leading-none">{a.icon ?? "📦"}</span>
                  {a.running && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)] animate-pulse" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${a.running ? "text-emerald-50 font-medium" : "text-neutral-300"}`}>
                    {a.name}
                  </div>
                  <div className={`text-[9px] font-mono uppercase tracking-wider ${a.running ? "text-emerald-400" : "text-neutral-500"}`}>
                    {a.running ? "● kører" : a.category ?? ""}
                  </div>
                </div>
                <div className="flex gap-1">
                  {!a.running && (
                    <button
                      disabled={isBusy}
                      onClick={() => callApp(a.name, "launch")}
                      title="Åbn"
                      className="w-6 h-6 rounded text-[11px] border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-30 flex items-center justify-center"
                    >
                      ▶
                    </button>
                  )}
                  {a.running && (
                    <>
                      <button
                        disabled={isBusy}
                        onClick={() => callApp(a.name, "launch")}
                        title="Fokusér"
                        className="w-6 h-6 rounded text-[11px] border border-cyan-400/20 text-cyan-300/80 hover:bg-cyan-500/10 disabled:opacity-30 flex items-center justify-center"
                      >
                        ⤴
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => callApp(a.name, "quit")}
                        title="Afslut"
                        className="w-6 h-6 rounded text-[11px] border border-rose-400/25 text-rose-300 hover:bg-rose-500/10 disabled:opacity-30 flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
