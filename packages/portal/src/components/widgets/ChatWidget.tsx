"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import {
  listConversations,
  newConversationId,
  getGlobalChatStats,
  type ConversationIndexEntry,
  type GlobalChatStats,
} from "@/lib/chat-storage";
import { usePoll } from "@/hooks/usePoll";

interface ModelsResp {
  available: boolean;
  models: Array<{ id: string; label?: string }>;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s siden`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t siden`;
  const d = Math.floor(h / 24);
  return `${d}d siden`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(2).replace(".", ",")}k`;
  return String(n);
}

function fmtMs(ms: number | undefined | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2).replace(".", ",")}s`;
}

function fmtTps(t: number | undefined | null): string {
  if (t == null || !isFinite(t)) return "—";
  return `${t.toFixed(1).replace(".", ",")}`;
}

/** Komprimér et model-ID: "openai/gpt-oss-20b" → "gpt-oss-20b" */
function shortModel(id: string): string {
  const slash = id.lastIndexOf("/");
  const base = slash >= 0 ? id.slice(slash + 1) : id;
  return base.length > 28 ? base.slice(0, 26) + "…" : base;
}

export function ChatWidget() {
  const [convs, setConvs] = useState<ConversationIndexEntry[]>([]);
  const [stats, setStats] = useState<GlobalChatStats | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  const { data: models } = usePoll<ModelsResp>("/api/chat/models", 30_000);

  useEffect(() => {
    setNewId(newConversationId());
    const refresh = () => {
      setConvs(listConversations().slice(0, 3));
      setStats(getGlobalChatStats());
    };
    refresh();
    const iv = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const latest = convs[0];
  const backendOk = models?.available;
  const modelCount = models?.models.length ?? 0;

  return (
    <Card
      widget="news"
      title="Chat"
      className="sm:col-span-2 lg:col-span-6"
      action={
        <span
          className={`text-[10px] font-mono uppercase tracking-wider ${
            backendOk ? "text-emerald-400/80" : "text-rose-400/80"
          }`}
        >
          {backendOk ? `${modelCount} model${modelCount === 1 ? "" : "ler"}` : "offline"}
        </span>
      }
    >
      <div className="space-y-3">
        {/* Stats-række */}
        <div className="grid grid-cols-4 gap-2">
          <Stat
            label="Tokens"
            value={stats ? fmtTokens(stats.totalCompletionTokens) : "—"}
            sub={stats?.totalPromptTokens ? `+${fmtTokens(stats.totalPromptTokens)} prompt` : undefined}
          />
          <Stat
            label="Tok/s"
            value={stats ? fmtTps(stats.avgTokensPerSec) : "—"}
            sub={stats?.avgTokensPerSec != null ? "snit 10" : undefined}
          />
          <Stat
            label="TTFT"
            value={fmtMs(stats?.latest?.ttfMs)}
            sub="seneste"
          />
          <Stat
            label="Samtaler"
            value={stats ? String(stats.conversationCount) : "0"}
            sub={stats ? `${stats.totalMessages} svar` : undefined}
          />
        </div>

        {/* Seneste stats + modeller */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-cyan-400/10">
          {/* Seneste svar-stats */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 mb-1">
              Seneste svar
            </div>
            {stats?.latest ? (
              <div className="text-[10px] font-mono text-neutral-400 space-y-0.5">
                <div className="text-cyan-300 truncate">
                  {shortModel(stats.latest.model ?? "—")}
                </div>
                <div>
                  {stats.latest.completionTokens != null && (
                    <span>{stats.latest.completionTokens} tok</span>
                  )}
                  {stats.latest.tokensPerSec != null && (
                    <span className="ml-2">{fmtTps(stats.latest.tokensPerSec)} t/s</span>
                  )}
                </div>
                <div>
                  {stats.latest.totalMs != null && (
                    <span>{fmtMs(stats.latest.totalMs)}</span>
                  )}
                  {stats.latest.finishReason && (
                    <span className="ml-2 text-neutral-500">{stats.latest.finishReason}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-neutral-600">(ingen svar endnu)</div>
            )}
          </div>

          {/* Seneste 3 modeller */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 mb-1">
              Seneste modeller
            </div>
            {stats && stats.recentModels.length > 0 ? (
              <ol className="text-[10px] font-mono space-y-0.5">
                {stats.recentModels.map((m, i) => (
                  <li key={m} className="truncate">
                    <span className="text-neutral-600 mr-1">{i + 1}</span>
                    <span className="text-neutral-200">{shortModel(m)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-[10px] text-neutral-600">(ingen endnu)</div>
            )}
          </div>
        </div>

        {/* Seneste samtaler */}
        {convs.length > 0 && (
          <div className="pt-2 border-t border-cyan-400/10">
            <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 mb-1">
              Seneste samtaler
            </div>
            <div className="space-y-1">
              {convs.map((c) => (
                <Link
                  key={c.id}
                  href={`/chat?c=${c.id}`}
                  className="block px-2 py-1 -mx-2 rounded hover:bg-neutral-900/50 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xs text-neutral-200 truncate flex-1">
                      {c.title || "Ny samtale"}
                    </div>
                    <div className="text-[9px] font-mono text-neutral-600 shrink-0">
                      {formatRelative(c.updatedAt)}
                    </div>
                  </div>
                  {c.preview && (
                    <div className="text-[10px] text-neutral-500 truncate mt-0.5">
                      {c.preview}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Handlinger */}
        <div className="flex gap-2 pt-2 border-t border-cyan-400/10">
          {latest ? (
            <Link
              href={`/chat?c=${latest.id}`}
              className="flex-1 text-center py-1.5 rounded border border-cyan-400/30 text-xs text-cyan-200 hover:border-cyan-400/60 hover:bg-cyan-400/5 transition-colors"
            >
              Fortsæt
            </Link>
          ) : null}
          <Link
            href={newId ? `/chat?c=${newId}` : "/chat"}
            className="flex-1 text-center py-1.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-xs text-cyan-100 hover:bg-cyan-400/30 transition-colors"
          >
            Ny samtale
          </Link>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-lg font-light tabular-nums text-neutral-100">{value}</div>
      <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-500">{label}</div>
      {sub && <div className="text-[9px] font-mono text-neutral-600 mt-0.5">{sub}</div>}
    </div>
  );
}
