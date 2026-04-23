import type { ChatMetrics } from "@/lib/chat-storage";

function fmtMs(ms: number | undefined | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2).replace(".", ",")}s`;
}

function fmtTps(tps: number | undefined | null): string {
  if (tps == null || !isFinite(tps)) return "—";
  return `${tps.toFixed(1).replace(".", ",")}`;
}

function shortModel(id: string): string {
  const slash = id.lastIndexOf("/");
  const base = slash >= 0 ? id.slice(slash + 1) : id;
  return base.length > 32 ? base.slice(0, 30) + "…" : base;
}

type ChipTone = "cyan" | "emerald" | "amber" | "violet" | "neutral" | "rose";

const TONE: Record<ChipTone, string> = {
  cyan: "bg-cyan-500/10 border-cyan-400/30 text-cyan-200",
  emerald: "bg-emerald-500/10 border-emerald-400/30 text-emerald-200",
  amber: "bg-amber-500/10 border-amber-400/30 text-amber-200",
  violet: "bg-violet-500/10 border-violet-400/30 text-violet-200",
  neutral: "bg-neutral-800/60 border-neutral-700/60 text-neutral-300",
  rose: "bg-rose-500/10 border-rose-400/30 text-rose-200",
};

function Chip({
  tone,
  label,
  value,
  title,
}: {
  tone: ChipTone;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <span className={`metric-chip ${TONE[tone]}`} title={title}>
      <span className="metric-chip-label">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

export function MessageMetrics({ m }: { m: ChatMetrics | undefined }) {
  if (!m) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 items-center">
      {m.model && (
        <Chip
          tone="cyan"
          label="Model"
          value={shortModel(m.model)}
          title={m.model}
        />
      )}
      {m.ttfMs != null && (
        <Chip
          tone="emerald"
          label="TTFT"
          value={fmtMs(m.ttfMs)}
          title="Time to first token"
        />
      )}
      {m.tokensPerSec != null && isFinite(m.tokensPerSec) && (
        <Chip
          tone="emerald"
          label="Tok/s"
          value={fmtTps(m.tokensPerSec)}
          title="Tokens per sekund under generering"
        />
      )}
      {m.completionTokens != null && (
        <Chip
          tone="amber"
          label="Tokens"
          value={String(m.completionTokens)}
          title="Completion tokens"
        />
      )}
      {m.promptTokens != null && (
        <Chip
          tone="violet"
          label="Prompt"
          value={String(m.promptTokens)}
          title="Prompt tokens"
        />
      )}
      {m.totalMs != null && (
        <Chip
          tone="neutral"
          label="Varighed"
          value={fmtMs(m.totalMs)}
          title="Total varighed fra request til afslutning"
        />
      )}
      {m.finishReason && (
        <Chip
          tone={m.finishReason === "stop" ? "neutral" : "rose"}
          label="Finish"
          value={m.finishReason}
          title="OpenAI finish_reason"
        />
      )}
    </div>
  );
}
