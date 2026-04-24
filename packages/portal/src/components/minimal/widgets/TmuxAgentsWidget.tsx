"use client";
import { usePoll } from "@/hooks/usePoll";
import { Section } from "../primitives";

/**
 * Pocket Agents widget — viser aktive tmux-sessioner og hvilke coding-agents
 * (claude, codex, etc.) der kører i hvilke vinduer. Klik "→ terminal" for at
 * åbne xterm.js-terminalen i Skynet.
 */

interface TmuxWindow {
  idx: number;
  name: string;
  cmd: string;
  active: boolean;
}

interface TmuxSession {
  name: string;
  windows: number;
  activityTs: number;
  attached: boolean;
  windowList: TmuxWindow[];
}

interface TmuxResponse {
  sessions: TmuxSession[];
}

/** Kommandoer vi visuelt fremhæver som "en agent" */
const AGENT_COMMANDS = new Set(["claude", "codex", "copilot", "aider", "ollama"]);

/** Formatér "for 2m siden" / "for 3t siden" — meget kompakt */
function relativeTime(tsMs: number): string {
  const diff = Date.now() - tsMs;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "nu";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}t`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

export function TmuxAgentsWidget() {
  const { data } = usePoll<TmuxResponse>("/api/tmux-sessions", 5000);
  const sessions = data?.sessions ?? [];

  const right = (
    <span className="text-neutral-600">
      {sessions.length === 0 ? "ingen sessioner" : `${sessions.length} session${sessions.length === 1 ? "" : "er"}`}
    </span>
  );

  return (
    <Section title="pocket agents" right={right} className="col-span-12 lg:col-span-6">
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : sessions.length === 0 ? (
        <div className="font-mono text-[11px] text-neutral-600 space-y-1">
          <div>ingen aktive tmux-sessioner.</div>
          <div className="text-neutral-700">
            start en: <code className="text-neutral-500">tmux new -s agents</code> og kør
            <code className="text-neutral-500 ml-1">claude</code> eller{" "}
            <code className="text-neutral-500">codex</code>
          </div>
          <div className="mt-2">
            <a
              href="/terminal?session=agents"
              className="text-sky-400 hover:text-sky-300"
            >
              → åbn terminal i Skynet
            </a>
          </div>
        </div>
      ) : (
        <div className="font-mono space-y-2">
          {sessions.map((s) => (
            <div
              key={s.name}
              className="border border-dashed border-neutral-800 p-2"
            >
              <div className="flex items-baseline gap-2 mb-1.5">
                <span
                  className="inline-block rounded-full shrink-0"
                  style={{
                    width: 6, height: 6,
                    background: s.attached ? "#7dd67d" : "#444",
                  }}
                  title={s.attached ? "attached" : "detached"}
                />
                <span className="text-neutral-100 text-[13px] truncate flex-1">{s.name}</span>
                <span className="text-[10px] text-neutral-600 shrink-0">
                  {s.windows}w · {relativeTime(s.activityTs)}
                </span>
              </div>

              <div className="space-y-[2px] pl-4">
                {s.windowList.slice(0, 4).map((w) => {
                  const isAgent = AGENT_COMMANDS.has(w.cmd.toLowerCase());
                  return (
                    <div key={w.idx} className="flex items-baseline gap-2 text-[10px]">
                      <span className="text-neutral-700 tabular-nums w-5 shrink-0">{w.idx}:</span>
                      <span className="text-neutral-500 truncate flex-1">{w.name}</span>
                      <span className={isAgent ? "text-emerald-400 shrink-0" : "text-neutral-600 shrink-0"}>
                        {isAgent ? "🤖 " : ""}
                        {w.cmd}
                        {w.active ? " ●" : ""}
                      </span>
                    </div>
                  );
                })}
                {s.windowList.length > 4 && (
                  <div className="text-[10px] text-neutral-700 pl-7">
                    + {s.windowList.length - 4} andre
                  </div>
                )}
              </div>

              <div className="mt-1.5 flex gap-3">
                <a
                  href={`/terminal?session=${encodeURIComponent(s.name)}`}
                  className="text-[10px] text-sky-400 hover:text-sky-300"
                >
                  → terminal
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(`ssh $(whoami)@$(hostname).local  # så: tmux attach -t ${s.name}`);
                  }}
                  className="text-[10px] text-neutral-500 hover:text-neutral-300"
                >
                  📋 SSH-kommando
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
