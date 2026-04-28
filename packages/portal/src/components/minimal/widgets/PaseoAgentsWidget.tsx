"use client";
import { usePoll } from "@/hooks/usePoll";
import { Section, Dot } from "../primitives";
import type { PaseoStatus } from "@/app/api/paseo/status/route";

/**
 * Paseo Agents widget — viser status for Paseo daemon på cockpittet.
 * Klik for at åbne /agents-siden hvor Paseo's web-app er embedded.
 *
 * Erstatter den gamle tmux-baserede pocket-agents widget. Når paseo's
 * `ls`-CLI får fix på session-validation-bug, kan vi udvide her med
 * konkret session-liste (titel, provider, status pr. agent).
 */

function relativeTime(iso: string | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}t`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

export function PaseoAgentsWidget() {
  const { data } = usePoll<PaseoStatus>("/api/paseo/status", 5000);
  const online = data?.online ?? false;
  const running = data?.runningAgents ?? 0;
  const idle = data?.idleAgents ?? 0;
  const total = running + idle;

  const right = online ? (
    <span>
      {total === 0 ? (
        <span className="text-neutral-600">ingen agents</span>
      ) : (
        <>
          {running > 0 && <span className="text-[#7dd67d]"><Dot tone="ok" />{running} running</span>}
          {running > 0 && idle > 0 && <span className="text-neutral-700 mx-1">·</span>}
          {idle > 0 && <span className="text-neutral-500">{idle} idle</span>}
        </>
      )}
    </span>
  ) : (
    <span className="text-[#d87373]"><Dot tone="bad" />offline</span>
  );

  return (
    <Section title="paseo agents" right={right} className="col-span-12 lg:col-span-6">
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : !online ? (
        <div className="font-mono text-[11px] text-neutral-600 space-y-1">
          <div>Paseo daemon kører ikke.</div>
          <div className="text-neutral-700">
            start: <code className="text-neutral-500">launchctl kickstart -k gui/$(id -u)/com.paseo.daemon</code>
          </div>
          {data.error && <div className="text-neutral-700 text-[10px] mt-1">fejl: {data.error}</div>}
        </div>
      ) : (
        <div className="font-mono">
          {/* Hovedstats — store tal */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[24px] font-extralight text-neutral-50 tabular-nums leading-none">{running}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-600 mt-1">aktive</div>
            </div>
            <div>
              <div className="text-[24px] font-extralight text-neutral-300 tabular-nums leading-none">{idle}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-600 mt-1">idle</div>
            </div>
          </div>

          {/* Daemon-meta */}
          <div className="text-[11px] text-neutral-500 space-y-0.5 leading-tight pt-2 border-t border-dashed border-neutral-900">
            <div className="flex justify-between">
              <span className="text-neutral-700">listen</span>
              <span className="text-neutral-300 tabular-nums">{data.listen}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-700">version</span>
              <span className="text-neutral-300 tabular-nums">v{data.daemonVersion}</span>
            </div>
            {data.startedAt && (
              <div className="flex justify-between">
                <span className="text-neutral-700">uptime</span>
                <span className="text-neutral-300">{relativeTime(data.startedAt)}</span>
              </div>
            )}
          </div>

          {total === 0 && (
            <div className="text-[11px] text-neutral-600 mt-3 leading-relaxed">
              Ingen agents kører. Start en fra Paseo-appen eller CLI:
              <div className="text-neutral-700 mt-1">
                <code className="text-neutral-500">paseo run --provider claude "din prompt"</code>
              </div>
            </div>
          )}

          <div className="mt-3 flex gap-3 text-[11px]">
            <a href="/agents" className="text-sky-400 hover:text-sky-300">
              → åbn agents
            </a>
            <a href="https://paseo.sh/download" target="_blank" rel="noreferrer" className="text-neutral-500 hover:text-neutral-300">
              ↗ desktop-app
            </a>
          </div>
        </div>
      )}
    </Section>
  );
}
