"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface DelegateTask {
  id: string;
  title: string;
  prompt: string;
  mode: "cli" | "terminal";
  agent?: string;
  effort?: string;
  workingDir: string;
  status: "running" | "done" | "failed" | "killed";
  pid?: number;
  exitCode?: number;
  startedAt: number;
  endedAt?: number;
  lastMessage?: string;
}

interface Artifact {
  name: string;
  relPath: string;
  size: number;
  modified: number;
  isDir: boolean;
}

const AGENTS = ["", "general-purpose", "Explore", "Plan"];
const EFFORTS = ["", "low", "medium", "high", "max"];

export default function DelegatePage() {
  const [tasks, setTasks] = useState<DelegateTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"cli" | "terminal">("cli");
  const [agent, setAgent] = useState("");
  const [effort, setEffort] = useState("");
  const [notifyOnDone, setNotifyOnDone] = useState(true);
  const [starting, setStarting] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch("/api/delegate", { cache: "no-store" });
      const j = await r.json();
      setTasks(j.tasks || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadTasks();
    const t = setInterval(loadTasks, 5000);
    return () => clearInterval(t);
  }, [loadTasks]);

  const startTask = async () => {
    if (!prompt.trim()) return;
    setStarting(true);
    try {
      const r = await fetch("/api/delegate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode,
          agent: agent || undefined,
          effort: effort || undefined,
          notifyOnDone,
        }),
      });
      const j = await r.json();
      if (j.ok && j.task) {
        setPrompt("");
        setSelectedId(j.task.id);
        await loadTasks();
      } else {
        alert(j.error || "Kunne ikke starte task");
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#07090b] text-neutral-100">
      <header className="border-b border-cyan-400/10 bg-[#0a0e11]/90">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/"
            className="w-9 h-9 rounded-lg border border-cyan-400/20 flex items-center justify-center text-cyan-300 hover:border-cyan-400/50"
          >
            ←
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-medium text-cyan-100">Delegate</h1>
            <div className="text-[11px] text-neutral-500">
              Send opgaver til Claude Code — i baggrunden (CLI) eller i Terminal. Artefakter gemmes i task-mappen og åbnes som links.
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Venstre: ny task + historik */}
        <div className="space-y-6">
          <section className="rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 p-4 space-y-3">
            <h2 className="text-sm font-medium text-cyan-200">Ny opgave</h2>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Fx: lav 3 mockups af et dashboard med forskellige farveskemaer og gem dem som HTML i denne mappe"
              rows={6}
              className="w-full bg-black/40 border border-cyan-400/20 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-cyan-400/50 resize-none"
            />
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <label className="space-y-1">
                <div className="text-neutral-400">Mode</div>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "cli" | "terminal")}
                  className="w-full bg-black/40 border border-cyan-400/20 rounded px-2 py-1.5 text-neutral-200"
                >
                  <option value="cli">CLI (headless)</option>
                  <option value="terminal">Terminal (interaktiv)</option>
                </select>
              </label>
              <label className="space-y-1">
                <div className="text-neutral-400">Effort</div>
                <select
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                  className="w-full bg-black/40 border border-cyan-400/20 rounded px-2 py-1.5 text-neutral-200"
                >
                  {EFFORTS.map((e) => (
                    <option key={e} value={e}>
                      {e || "(default)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 space-y-1">
                <div className="text-neutral-400">Agent (valgfri)</div>
                <select
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                  className="w-full bg-black/40 border border-cyan-400/20 rounded px-2 py-1.5 text-neutral-200"
                >
                  {AGENTS.map((a) => (
                    <option key={a} value={a}>
                      {a || "(default)"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={notifyOnDone}
                onChange={(e) => setNotifyOnDone(e.target.checked)}
                className="accent-cyan-400"
              />
              <span className="text-neutral-300">Push når færdig (ntfy/macOS)</span>
            </label>
            <button
              onClick={startTask}
              disabled={starting || !prompt.trim()}
              className="w-full px-3 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {starting ? "Starter..." : "Send opgave"}
            </button>
          </section>

          <section className="rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 p-3">
            <h2 className="text-sm font-medium text-cyan-200 px-1 mb-2">Historik</h2>
            {tasks.length === 0 ? (
              <div className="text-[12px] text-neutral-500 px-1">Ingen opgaver endnu</div>
            ) : (
              <div className="space-y-1">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-2 py-1.5 rounded border text-[12px] transition-colors ${
                      selectedId === t.id
                        ? "border-cyan-400/50 bg-cyan-500/10"
                        : "border-transparent hover:border-cyan-400/20 hover:bg-black/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <StatusDot status={t.status} />
                      <span className="text-neutral-200 truncate flex-1">{t.title}</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 flex gap-2 mt-0.5">
                      <span>{new Date(t.startedAt).toLocaleTimeString("da-DK")}</span>
                      <span>·</span>
                      <span>{t.mode}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Højre: detaljer for valgt task */}
        <div>
          {selectedId ? (
            <TaskDetail key={selectedId} taskId={selectedId} onChange={loadTasks} />
          ) : (
            <div className="rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 p-6 text-center text-[13px] text-neutral-500">
              Vælg en opgave for at se stream + artefakter
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatusDot({ status }: { status: DelegateTask["status"] }) {
  const color =
    status === "running"
      ? "bg-cyan-400 animate-pulse"
      : status === "done"
      ? "bg-emerald-500"
      : status === "killed"
      ? "bg-amber-500"
      : "bg-red-500";
  return <span className={`w-2 h-2 rounded-full ${color}`} />;
}

function TaskDetail({ taskId, onChange }: { taskId: string; onChange: () => void }) {
  const [task, setTask] = useState<DelegateTask | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [log, setLog] = useState<string>("");
  const logRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Hent metadata + artefakter
  const refreshMeta = useCallback(async () => {
    try {
      const r = await fetch(`/api/delegate/${taskId}`, { cache: "no-store" });
      const j = await r.json();
      if (j.task) setTask(j.task);
      if (j.artifacts) setArtifacts(j.artifacts);
    } catch {
      // ignore
    }
  }, [taskId]);

  useEffect(() => {
    refreshMeta();
    const t = setInterval(refreshMeta, 3000);
    return () => clearInterval(t);
  }, [refreshMeta]);

  // Stream log
  useEffect(() => {
    setLog("");
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/delegate/${taskId}/stream`, {
          signal: controller.signal,
        });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line);
              if (ev.type === "log") {
                setLog((prev) => prev + (ev.data as string));
              } else if (ev.type === "status") {
                setTask(ev.data as DelegateTask);
                onChange();
              } else if (ev.type === "end") {
                refreshMeta();
                onChange();
              }
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // aborted eller fejl — ignore
      }
    })();
    return () => controller.abort();
  }, [taskId, refreshMeta, onChange]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log, autoScroll]);

  const killTask = async () => {
    if (!task || task.status !== "running") return;
    if (!confirm("Stop denne task?")) return;
    await fetch(`/api/delegate/${taskId}`, { method: "DELETE" });
    refreshMeta();
    onChange();
  };

  if (!task) {
    return (
      <div className="rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 p-4 text-[13px] text-neutral-500">
        Henter...
      </div>
    );
  }

  const prettyLog = prettifyStreamJson(log);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 p-4 space-y-2">
        <div className="flex items-start gap-3">
          <StatusDot status={task.status} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium text-cyan-100">{task.title}</h2>
            <div className="text-[11px] text-neutral-500 flex flex-wrap gap-2 mt-1">
              <span>status: {task.status}</span>
              <span>·</span>
              <span>mode: {task.mode}</span>
              {task.agent && (
                <>
                  <span>·</span>
                  <span>agent: {task.agent}</span>
                </>
              )}
              {task.effort && (
                <>
                  <span>·</span>
                  <span>effort: {task.effort}</span>
                </>
              )}
              <span>·</span>
              <span>startet: {new Date(task.startedAt).toLocaleString("da-DK")}</span>
              {task.endedAt && (
                <>
                  <span>·</span>
                  <span>
                    varighed:{" "}
                    {Math.round((task.endedAt - task.startedAt) / 1000)}s
                  </span>
                </>
              )}
            </div>
          </div>
          {task.status === "running" && (
            <button
              onClick={killTask}
              className="px-3 py-1 rounded bg-red-500/20 border border-red-400/30 text-red-200 text-[12px] hover:bg-red-500/30"
            >
              Stop
            </button>
          )}
        </div>
        <details className="text-[12px]">
          <summary className="text-neutral-400 cursor-pointer hover:text-neutral-200">
            Prompt
          </summary>
          <pre className="mt-2 p-2 rounded bg-black/40 border border-cyan-400/10 text-neutral-300 whitespace-pre-wrap font-mono text-[11px]">
            {task.prompt}
          </pre>
        </details>
        <div className="text-[11px] text-neutral-500 font-mono truncate">
          📁 {task.workingDir}
        </div>
      </section>

      {/* Artefakter */}
      <section className="rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-cyan-200">
            Artefakter {artifacts.length > 0 && `(${artifacts.filter((a) => !a.isDir).length})`}
          </h3>
          <button
            onClick={refreshMeta}
            className="text-[11px] text-neutral-400 hover:text-neutral-200"
          >
            Genindlæs
          </button>
        </div>
        {artifacts.length === 0 ? (
          <div className="text-[12px] text-neutral-500">Ingen filer endnu</div>
        ) : (
          <div className="space-y-1">
            {artifacts
              .filter((a) => !a.isDir)
              .map((a) => {
                const viewUrl = `/api/delegate/${taskId}/file?path=${encodeURIComponent(
                  a.relPath
                )}`;
                const dlUrl = viewUrl + "&download=1";
                return (
                  <div
                    key={a.relPath}
                    className="flex items-center gap-2 py-1 px-2 rounded hover:bg-black/30 text-[12px]"
                  >
                    <span className="text-cyan-300">📄</span>
                    <a
                      href={viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-200 hover:text-cyan-100 hover:underline font-mono flex-1 truncate"
                    >
                      {a.relPath}
                    </a>
                    <span className="text-neutral-500 text-[10px]">
                      {formatSize(a.size)}
                    </span>
                    <a
                      href={dlUrl}
                      className="text-neutral-400 hover:text-neutral-200 text-[11px]"
                    >
                      ↓
                    </a>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* Log */}
      <section className="rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-cyan-200">Stream</h3>
          <label className="text-[11px] text-neutral-400 flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-cyan-400"
            />
            Auto-scroll
          </label>
        </div>
        <div
          ref={logRef}
          className="h-[400px] overflow-y-auto bg-black/50 border border-cyan-400/10 rounded p-3 font-mono text-[11px] text-neutral-300 whitespace-pre-wrap"
        >
          {prettyLog || (
            <span className="text-neutral-600">
              {task.status === "running" ? "Afventer output..." : "Ingen log"}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Ekstraher læsbar assistent-tekst + tool-use-overskrifter fra stream-json.
 * Fallback: vis rå linjer der ikke kunne parses.
 */
function prettifyStreamJson(raw: string): string {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const ev = JSON.parse(s);
      if (ev.type === "assistant" && ev.message?.content) {
        for (const c of ev.message.content) {
          if (c.type === "text" && typeof c.text === "string") {
            out.push(c.text);
          } else if (c.type === "tool_use") {
            out.push(`\n▸ tool: ${c.name}${c.input ? " " + summarizeInput(c.input) : ""}`);
          }
        }
      } else if (ev.type === "user" && ev.message?.content) {
        for (const c of ev.message.content) {
          if (c.type === "tool_result") {
            const body =
              typeof c.content === "string"
                ? c.content
                : Array.isArray(c.content)
                ? c.content
                    .map((x: { type: string; text?: string }) =>
                      x.type === "text" ? x.text : ""
                    )
                    .join("")
                : "";
            const short = body.length > 200 ? body.slice(0, 200) + "…" : body;
            out.push(`  ← ${short.replace(/\n/g, " ")}`);
          }
        }
      } else if (ev.type === "result") {
        out.push(`\n✓ ${ev.subtype ?? "done"} — ${ev.num_turns ?? "?"} turns`);
      } else if (ev.type === "system" && ev.subtype === "init") {
        out.push(
          `⚙  session ${ev.session_id ?? ""}  model=${ev.model ?? "?"}`
        );
      } else if (s.startsWith("[stderr]") || s.startsWith("[error]")) {
        out.push(s);
      }
    } catch {
      // Ikke JSON — vis rå linje (trunkeret)
      out.push(s.length > 500 ? s.slice(0, 500) + "…" : s);
    }
  }
  return out.join("\n");
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const entries = Object.entries(input as Record<string, unknown>).slice(0, 2);
  return entries
    .map(([k, v]) => {
      const val =
        typeof v === "string"
          ? v.length > 40
            ? v.slice(0, 40) + "…"
            : v
          : JSON.stringify(v).slice(0, 40);
      return `${k}=${val}`;
    })
    .join(" ");
}
