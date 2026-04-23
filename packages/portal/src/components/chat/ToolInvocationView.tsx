"use client";
import { useState } from "react";
import type { ToolInvocation } from "@/lib/chat-storage";

interface Props {
  tools: ToolInvocation[];
}

const ICONS: Record<string, string> = {
  list_services: "⚙",
  control_service: "🔧",
  list_apps: "📱",
  control_app: "🎛",
  read_system_status: "📊",
  read_disk: "💾",
  read_weather: "🌦",
  read_energy: "⚡",
  list_files: "📁",
  read_file: "📄",
  run_discovery: "🔍",
};

function statusDot(inv: ToolInvocation): {
  color: string;
  label: string;
} {
  if (inv.blocked) return { color: "bg-amber-400", label: "blokeret" };
  if (inv.endedAt == null) return { color: "bg-cyan-400 animate-pulse", label: "kører" };
  if (inv.ok === false) return { color: "bg-rose-400", label: "fejl" };
  return { color: "bg-emerald-400", label: "ok" };
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

function prettyResult(raw: string | undefined, maxLen = 400): string {
  if (!raw) return "";
  try {
    const obj = JSON.parse(raw);
    const s = JSON.stringify(obj, null, 2);
    return s.length > maxLen ? s.slice(0, maxLen) + "\n…[trunkeret]" : s;
  } catch {
    return raw.length > maxLen ? raw.slice(0, maxLen) + "…[trunkeret]" : raw;
  }
}

function InvocationCard({ inv }: { inv: ToolInvocation }) {
  const [open, setOpen] = useState(false);
  const { color, label } = statusDot(inv);
  const icon = ICONS[inv.name] ?? "🔹";
  const duration =
    inv.endedAt && inv.startedAt ? Math.round(inv.endedAt - inv.startedAt) : null;
  const argsPreview = formatArgs(inv.args);

  return (
    <div className="rounded-lg border border-cyan-400/20 bg-[#0a1216]/60 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cyan-400/5 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} title={label} />
        <span className="text-sm shrink-0">{icon}</span>
        <span className="text-[12px] font-mono text-cyan-200 shrink-0">{inv.name}</span>
        {argsPreview && (
          <span className="text-[11px] font-mono text-neutral-500 truncate flex-1 min-w-0">
            {argsPreview}
          </span>
        )}
        {duration != null && (
          <span className="text-[10px] font-mono text-neutral-600 shrink-0">
            {duration}ms
          </span>
        )}
        <span className="text-[10px] text-neutral-600 shrink-0">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="border-t border-cyan-400/10 px-3 py-2 space-y-2">
          {Object.keys(inv.args).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono mb-1">
                Argumenter
              </div>
              <pre className="text-[11px] font-mono text-neutral-300 whitespace-pre-wrap break-all bg-black/40 rounded px-2 py-1.5">
                {JSON.stringify(inv.args, null, 2)}
              </pre>
            </div>
          )}
          {inv.blocked ? (
            <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded px-2 py-1.5">
              Blokeret: destruktiv action kræver bekræftelse. Bed brugeren eksplicit.
            </div>
          ) : inv.result ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono mb-1">
                Resultat {inv.ok === false && <span className="text-rose-400">(fejl)</span>}
              </div>
              <pre className="text-[11px] font-mono text-neutral-300 whitespace-pre-wrap break-all bg-black/40 rounded px-2 py-1.5 max-h-[240px] overflow-y-auto">
                {prettyResult(inv.result)}
              </pre>
            </div>
          ) : (
            <div className="text-[11px] font-mono text-neutral-500 italic">kører…</div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolInvocationView({ tools }: Props) {
  if (!tools || tools.length === 0) return null;
  return (
    <div className="space-y-1.5 mb-3">
      {tools.map((inv) => (
        <InvocationCard key={inv.id} inv={inv} />
      ))}
    </div>
  );
}
