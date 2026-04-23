"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Detection {
  key: string;
  name: string;
  status: "ok" | "missing" | "partial" | "unknown";
  details?: string;
  hint?: string;
  feature: string;
  configured?: boolean;
}

interface DiscoverResp {
  detections: Detection[];
  summary: { ok: number; partial: number; missing: number; total: number };
  at: string;
}

const STATUS_STYLE: Record<Detection["status"], { dot: string; label: string; labelColor: string }> = {
  ok: {
    dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]",
    label: "Klar",
    labelColor: "text-emerald-400",
  },
  partial: {
    dot: "bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.5)]",
    label: "Delvis",
    labelColor: "text-amber-400",
  },
  missing: {
    dot: "bg-rose-400",
    label: "Mangler",
    labelColor: "text-rose-400",
  },
  unknown: {
    dot: "bg-neutral-600",
    label: "?",
    labelColor: "text-neutral-500",
  },
};

export default function SetupPage() {
  const [resp, setResp] = useState<DiscoverResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/control/discover", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResp(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "fejl");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const summary = resp?.summary;

  return (
    <div className="min-h-screen bg-[#0a0f12] text-neutral-100 px-4 sm:px-8 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-400/70 font-mono">
            ▌ S.K.Y.N.E.T. · Setup
          </div>
          <h1 className="text-3xl sm:text-4xl font-thin text-cyan-100 mt-3 tracking-tight">
            Velkommen.
          </h1>
          <p className="text-sm text-neutral-400 mt-2 max-w-2xl leading-relaxed">
            SKYNET har scannet din maskine for datakilder og integrationer.
            Det meste virker out-of-box — nedenfor kan du se hvad der er klar,
            og hvad der kræver en API-nøgle eller en app-installation.
          </p>
        </div>

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 px-4 py-3">
              <div className="text-3xl font-thin text-emerald-300 tabular-nums">{summary.ok}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400/70 font-mono mt-1">
                Klar
              </div>
            </div>
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 px-4 py-3">
              <div className="text-3xl font-thin text-amber-300 tabular-nums">{summary.partial}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-amber-400/70 font-mono mt-1">
                Delvis
              </div>
            </div>
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/5 px-4 py-3">
              <div className="text-3xl font-thin text-rose-300 tabular-nums">{summary.missing}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-rose-400/70 font-mono mt-1">
                Mangler
              </div>
            </div>
          </div>
        )}

        {/* Actions bar */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="text-[10px] font-mono text-neutral-500">
            {resp?.at ? `scannet ${new Date(resp.at).toLocaleTimeString("da-DK")}` : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={run}
              disabled={loading}
              className="px-3 py-1.5 rounded border border-cyan-400/30 text-cyan-300 text-xs font-mono hover:bg-cyan-500/10 disabled:opacity-40"
            >
              {loading ? "scanner…" : "↻ rescan"}
            </button>
            <Link
              href="/settings"
              className="px-3 py-1.5 rounded border border-neutral-700 text-neutral-300 text-xs font-mono hover:border-cyan-400/40"
            >
              Settings
            </Link>
            <Link
              href="/"
              className="px-3 py-1.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 text-xs font-mono hover:bg-cyan-500/30"
            >
              → Dashboard
            </Link>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2 rounded border border-rose-500/30 bg-rose-950/30 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Detections */}
        <div className="space-y-2">
          {resp?.detections.map((d) => {
            const style = STATUS_STYLE[d.status];
            return (
              <div
                key={d.key}
                className={`rounded-lg border px-4 py-3 transition-colors ${
                  d.status === "ok"
                    ? "border-emerald-400/20 bg-emerald-500/[0.03]"
                    : d.status === "partial"
                    ? "border-amber-400/20 bg-amber-500/[0.03]"
                    : d.status === "missing"
                    ? "border-rose-400/20 bg-rose-500/[0.03]"
                    : "border-neutral-800 bg-neutral-900/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${style.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-sm font-medium text-neutral-100">{d.name}</span>
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${style.labelColor}`}>
                        {style.label}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-600">
                        → {d.feature}
                      </span>
                    </div>
                    {d.details && (
                      <div className="text-xs text-neutral-400 mt-1">{d.details}</div>
                    )}
                    {d.hint && (
                      <div className="text-xs text-neutral-500 mt-1.5 italic">{d.hint}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer guidance */}
        <div className="mt-8 text-xs text-neutral-500 leading-relaxed border-t border-neutral-900 pt-6">
          <p className="mb-2">
            <span className="text-neutral-400 font-medium">Dashboardet virker allerede.</span>{" "}
            Widgets der ikke kræver lokale integrationer (vejr, fly, jordskælv, markeder, nyheder, APOD)
            henter data direkte fra offentlige API&apos;er.
          </p>
          <p>
            Vil du have chat, Plex-widget eller NZB-download-tracking at virke? Følg hint&apos;ene
            ovenfor og kør scanning igen.
          </p>
        </div>
      </div>
    </div>
  );
}
