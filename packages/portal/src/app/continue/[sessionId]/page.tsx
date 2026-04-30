"use client";
import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";

interface SessionSummary {
  sessionId: string;
  cwd?: string;
  project?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
  messageCount: number;
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
  toolsUsed: string[];
}

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

const inputStyle = {
  width: "100%",
  background: "#0d0d0d",
  border: "1px dashed #333",
  borderRadius: 6,
  padding: "10px 12px",
  color: "#e5e5e5",
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  fontSize: 14,
  outline: "none",
  resize: "vertical" as const,
};

export default function ContinuePage({ params }: PageProps) {
  const { sessionId } = use(params);
  const search = useSearchParams();
  const cwd = search.get("cwd") ?? undefined;

  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; pid?: number; message?: string; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = cwd
          ? `/api/claude/session/${encodeURIComponent(sessionId)}?cwd=${encodeURIComponent(cwd)}`
          : `/api/claude/session/${encodeURIComponent(sessionId)}`;
        const res = await fetch(url);
        const data = await res.json() as { ok: boolean; summary?: SessionSummary; error?: string };
        if (cancelled) return;
        if (data.ok && data.summary) {
          setSummary(data.summary);
        } else {
          setError(data.error ?? "kunne ikke hente session");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fejl");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, cwd]);

  const submit = async () => {
    if (!prompt.trim() || !summary) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/claude/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: summary.sessionId,
          cwd: summary.cwd,
          prompt: prompt.trim(),
        }),
      });
      const data = await res.json() as { ok: boolean; pid?: number; message?: string; error?: string };
      setResult(data);
      if (data.ok) setPrompt("");
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "fejl" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        padding: "24px 16px 60px",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <a
          href="/minimal"
          style={{ color: "#6b6b6b", fontSize: 12, textDecoration: "none" }}
        >
          ← Skynet
        </a>
        <h1 style={{ fontSize: 18, margin: "8px 0 4px", color: "#e5e5e5", fontWeight: 500 }}>
          Fortsæt Claude Code-session
        </h1>
        <div style={{ color: "#6b6b6b", fontSize: 12 }}>
          <code style={{ color: "#9bd0ff" }}>{sessionId.slice(0, 8)}…</code>
          {summary?.project && <span> · {summary.project}</span>}
        </div>
      </div>

      {loading && <div style={{ color: "#6b6b6b", fontSize: 13 }}>indlæser session…</div>}

      {error && (
        <div style={{ background: "#1f0a0a", border: "1px solid #5a2c2c", borderRadius: 6, padding: 12, fontSize: 13, color: "#d87373" }}>
          ✗ {error}
        </div>
      )}

      {summary && (
        <>
          {/* Context-blok */}
          <section style={{ background: "#0d0d0d", border: "1px dashed #262626", borderRadius: 8, padding: "12px 14px", marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#525252", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.15em" }}>
              # context
            </div>
            <div style={{ fontSize: 12, color: "#6b6b6b", marginBottom: 4 }}>
              {summary.messageCount} messages · {formatDuration(summary.durationMs)}
              {summary.toolsUsed.length > 0 && ` · ${summary.toolsUsed.length} tools`}
            </div>
            {summary.toolsUsed.length > 0 && (
              <div style={{ fontSize: 11, color: "#525252", marginBottom: 8 }}>
                {summary.toolsUsed.join(" · ")}
              </div>
            )}

            {summary.lastUserMessage && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: "#525252", marginBottom: 4, letterSpacing: "0.15em" }}>SIDSTE PROMPT</div>
                <div style={{ fontSize: 13, color: "#9bd0ff", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {truncate(summary.lastUserMessage, 400)}
                </div>
              </div>
            )}

            {summary.lastAssistantMessage && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: "#525252", marginBottom: 4, letterSpacing: "0.15em" }}>CLAUDE&apos;S SVAR</div>
                <div style={{ fontSize: 13, color: "#e5e5e5", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
                  {truncate(summary.lastAssistantMessage, 600)}
                </div>
              </div>
            )}
          </section>

          {/* Reply-form */}
          <section>
            <div style={{ fontSize: 11, color: "#525252", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.15em" }}>
              # din reply
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Skriv din næste prompt — Claude Code kører den i baggrunden og sender ny push når den er færdig…"
              rows={6}
              autoFocus
              style={inputStyle}
              disabled={submitting}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 12 }}>
              <span style={{ fontSize: 11, color: "#525252" }}>⌘+Enter for at sende</span>
              <button
                onClick={submit}
                disabled={!prompt.trim() || submitting}
                style={{
                  background: prompt.trim() && !submitting ? "#1a3a5a" : "#1a1a1a",
                  border: `1px solid ${prompt.trim() && !submitting ? "#3a6a9a" : "#262626"}`,
                  borderRadius: 6,
                  padding: "10px 18px",
                  color: prompt.trim() && !submitting ? "#9bd0ff" : "#525252",
                  fontFamily: "inherit",
                  fontSize: 13,
                  cursor: prompt.trim() && !submitting ? "pointer" : "default",
                }}
              >
                {submitting ? "starter…" : "→ kør i Claude Code"}
              </button>
            </div>

            {result && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 6,
                  background: result.ok ? "#0a1a0a" : "#1f0a0a",
                  border: `1px solid ${result.ok ? "#2c4a2c" : "#5a2c2c"}`,
                  fontSize: 12,
                  color: result.ok ? "#7dd67d" : "#d87373",
                }}
              >
                {result.ok ? (
                  <>
                    ✓ {result.message ?? "Claude Code startet"}
                    {result.pid && <span style={{ color: "#525252", marginLeft: 8 }}>pid {result.pid}</span>}
                  </>
                ) : (
                  <>✗ {result.error ?? "fejl"}</>
                )}
              </div>
            )}
          </section>

          {summary.cwd && (
            <div style={{ marginTop: 32, fontSize: 11, color: "#3a3a3a" }}>
              cwd · <code>{summary.cwd}</code>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${hr}t ${m}m` : `${hr}t`;
}
