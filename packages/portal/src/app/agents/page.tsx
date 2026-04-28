"use client";
import { useEffect, useState, useCallback } from "react";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section, Dot } from "@/components/minimal/primitives";
import { Button, ButtonLink } from "@/components/ui/Button";
import type { PaseoStatus } from "@/app/api/paseo/status/route";
import type { PaseoPair } from "@/app/api/paseo/pair/route";

/**
 * Agents-side er en Paseo-embed: Paseo daemon kører på :6868, og vi viser
 * Paseo's hosted web app (https://app.paseo.sh) pre-paret med lokal daemon
 * via daemonens pair-URL. Det giver fuld agent-orkestrering (Claude Code,
 * Codex, OpenCode, Pi) uden at Skynet skal genimplementere UI'en.
 */
export default function AgentsPage() {
  const [status, setStatus] = useState<PaseoStatus | null>(null);
  const [pair, setPair] = useState<PaseoPair | null>(null);
  const [loading, setLoading] = useState(true);
  const [embed, setEmbed] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        fetch("/api/paseo/status").then((r) => r.json()) as Promise<PaseoStatus>,
        fetch("/api/paseo/pair").then((r) => r.json()) as Promise<PaseoPair>,
      ]);
      setStatus(s);
      setPair(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const online = status?.online ?? false;

  return (
    <MinimalPageLayout active="agents">
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px 60px" }}>
        {/* Status-banner */}
        <Section
          title="paseo · agent orchestrator"
          right={
            <span className="font-mono">
              {loading ? (
                <span className="text-neutral-700">indlæser…</span>
              ) : online ? (
                <>
                  <Dot tone="ok" />
                  <span className="text-[#7dd67d]">running</span>
                  <span className="text-neutral-700"> · {status?.listen}</span>
                  <span className="text-neutral-700"> · v{status?.daemonVersion}</span>
                </>
              ) : (
                <>
                  <Dot tone="bad" />
                  <span className="text-[#d87373]">stopped</span>
                </>
              )}
            </span>
          }
          className="mb-4"
        >
          {online ? (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[12px] text-neutral-500 mb-3">
              <span><span className="text-neutral-700">running </span><span className="text-neutral-200 tabular-nums">{status?.runningAgents ?? 0}</span></span>
              <span><span className="text-neutral-700">idle </span><span className="text-neutral-200 tabular-nums">{status?.idleAgents ?? 0}</span></span>
              <span><span className="text-neutral-700">started </span><span className="text-neutral-300">{status?.startedAt ? new Date(status.startedAt).toLocaleString("da-DK", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "—"}</span></span>
              <span className="text-neutral-700">pid {status?.pid}</span>
              <div className="flex-1" />
              <Button size="sm" tone="ghost" onClick={() => setEmbed((v) => !v)}>
                {embed ? "→ skjul embed" : "→ vis embed"}
              </Button>
              {pair?.url && (
                <ButtonLink size="sm" tone="accent" href={pair.url} target="_blank" rel="noreferrer">
                  → åbn i ny fane
                </ButtonLink>
              )}
            </div>
          ) : (
            <div className="font-mono text-[12px] text-neutral-500 space-y-2">
              <div className="text-[#d87373]">Paseo daemon kører ikke.</div>
              <div className="text-neutral-600">
                Start med <code className="text-neutral-400">launchctl kickstart -k gui/$(id -u)/com.paseo.daemon</code>
                {" "}eller installer via <a href="https://paseo.sh/download" target="_blank" rel="noreferrer" className="text-sky-400/70">paseo.sh/download</a>.
              </div>
              {status?.error && <div className="text-neutral-700 text-[11px]">fejl: {status.error}</div>}
            </div>
          )}
        </Section>

        {/* Embed Paseo's web app */}
        {online && embed && pair?.url && (
          <div
            className="border border-dashed border-neutral-800"
            style={{ height: "calc(100vh - 220px)", minHeight: 600 }}
          >
            <iframe
              src={pair.url}
              title="Paseo agents"
              className="w-full h-full"
              style={{ border: "none", background: "#0a0a0a" }}
              allow="clipboard-read; clipboard-write; microphone"
            />
          </div>
        )}

        {online && !embed && (
          <div className="font-mono text-[11px] text-neutral-600 mt-3">
            Embed skjult. Brug "åbn i ny fane" eller download Paseo desktop-appen fra{" "}
            <a href="https://paseo.sh/download" target="_blank" rel="noreferrer" className="text-sky-400/70">paseo.sh/download</a>.
          </div>
        )}

        {/* Provider-info */}
        <div className="mt-4 font-mono text-[10px] text-neutral-700">
          providers: claude-code · codex · opencode · pi · copilot · skift via{" "}
          <code className="text-neutral-500">paseo provider ls</code>
        </div>
      </main>
    </MinimalPageLayout>
  );
}
