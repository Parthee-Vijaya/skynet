"use client";
import { useCallback, useEffect, useState } from "react";
import type { Automation, AutomationRun } from "@/lib/agent/types";
import type { DryRunStep } from "@/lib/agent/actions";

interface Props {
  automation: Automation | null;
  onClose: () => void;
}

interface DetailResponse {
  automation: Automation;
  runs: AutomationRun[];
}

interface DryRunResponse {
  ok: boolean;
  message: string;
  dryRunPreview?: DryRunStep[];
}

export function AutomationDetailDrawer({ automation, onClose }: Props) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);

  const load = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/automations/${id}`, { cache: "no-store" });
      const data = (await res.json()) as DetailResponse;
      setRuns(data.runs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (automation) {
      load(automation.id);
      setDryRun(null);
    } else {
      setRuns([]);
      setDryRun(null);
    }
  }, [automation, load]);

  if (!automation) return null;

  const runDryRun = async () => {
    setDryRunLoading(true);
    setDryRun(null);
    try {
      const res = await fetch(`/api/automations/${automation.id}/run?dryRun=1`, {
        method: "POST",
      });
      const data = (await res.json()) as DryRunResponse;
      setDryRun(data);
    } catch (e) {
      setDryRun({ ok: false, message: e instanceof Error ? e.message : "fejl" });
    } finally {
      setDryRunLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex justify-end"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#0a0a0a] border-l border-cyan-400/15 h-full overflow-y-auto"
      >
        <header className="px-5 py-4 border-b border-cyan-400/10 sticky top-0 bg-[#0a0a0a] z-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-400/70 font-mono">
                # automation
              </div>
              <div className="text-base text-cyan-100 mt-0.5">{automation.name}</div>
              {automation.description && (
                <div className="text-[12px] text-neutral-500 mt-0.5">{automation.description}</div>
              )}
            </div>
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 text-lg">✕</button>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={runDryRun}
              disabled={dryRunLoading}
              className="text-[11px] px-3 py-1.5 rounded border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40"
            >
              {dryRunLoading ? "tester…" : "🧪 test (dry-run)"}
            </button>
            <span className="text-[11px] text-neutral-600 self-center">
              kører action-kæden uden at sende push/iMessage
            </span>
          </div>
        </header>

        {/* Dry-run preview */}
        {dryRun && (
          <section className="px-5 py-3 border-b border-cyan-400/10 bg-emerald-500/5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400/70 font-mono mb-2">
              dry-run resultat — {dryRun.ok ? "ok" : "fejl"}
            </div>
            <div className="text-[11px] text-neutral-400 mb-3 font-mono">{dryRun.message}</div>
            {dryRun.dryRunPreview?.map((step, i) => (
              <div
                key={i}
                className="border border-emerald-400/15 rounded p-2 mb-2 bg-black/30 font-mono text-[11px]"
              >
                <div className="text-emerald-300 mb-1">
                  {i + 1}. {step.summary}
                </div>
                {step.detail && (
                  <pre className="text-neutral-400 whitespace-pre-wrap break-words text-[10px] leading-relaxed">
                    {prettyDetail(step.detail)}
                  </pre>
                )}
              </div>
            ))}
            {!dryRun.dryRunPreview && (
              <div className="text-[11px] text-neutral-600">(ingen preview-data)</div>
            )}
          </section>
        )}

        {/* Run history */}
        <section className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-400/70 font-mono">
              # historik · sidste {runs.length}
            </div>
            <button onClick={() => load(automation.id)} className="text-[11px] text-neutral-500 hover:text-neutral-300">
              ↻ refresh
            </button>
          </div>
          {loading ? (
            <div className="text-[12px] text-neutral-600 font-mono">indlæser…</div>
          ) : runs.length === 0 ? (
            <div className="text-[12px] text-neutral-600 font-mono">
              ingen kørsler endnu — klik &quot;test (dry-run)&quot; eller &quot;kør&quot; for at starte
            </div>
          ) : (
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-neutral-600 border-b border-dashed border-neutral-800">
                  <th className="text-left py-1 font-normal">tid</th>
                  <th className="text-left py-1 font-normal">status</th>
                  <th className="text-left py-1 font-normal">besked</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-dashed border-neutral-900">
                    <td className="py-1.5 text-neutral-500 whitespace-nowrap pr-3">
                      {new Date(r.startedAt).toLocaleString("da-DK", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-1.5 text-neutral-400 break-words" style={{ wordBreak: "break-word" }}>
                      {r.message ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AutomationRun["status"] }) {
  const color = status === "ok" ? "#7dd67d" : status === "error" ? "#d87373" : "#9b9b9b";
  const sym = status === "ok" ? "✓" : status === "error" ? "✗" : "○";
  return (
    <span style={{ color }}>
      {sym} {status}
    </span>
  );
}

function prettyDetail(d: Record<string, unknown>): string {
  try {
    return JSON.stringify(d, null, 2);
  } catch {
    return String(d);
  }
}
