/**
 * Delegate-til-Claude — spawn Claude Code CLI som baggrunds-opgave.
 *
 * Hver task får et eget working-dir under ~/Desktop/Claude/projekter/skynet-tasks/<uuid>/
 * så Claude kan lave filer (mockups, screenshots, rapporter) uden at røre Skynet-koden.
 *
 * To modes:
 *   - "cli":      headless `claude -p --output-format stream-json` — log streames til UI
 *   - "terminal": åbner nyt Terminal-vindue med interaktiv `claude "prompt"`-session
 *
 * Artefakter vises som simple links (brugeren åbner i ny tab).
 */

import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, existsSync, createWriteStream, readdirSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { getDb } from "../db";
import { notify } from "../notify";

const TASKS_ROOT = path.join(os.homedir(), "Desktop", "Claude", "projekter", "skynet-tasks");
const CLAUDE_BIN = "/opt/homebrew/bin/claude";
const LOG_FILENAME = ".skynet-stream.jsonl";

export type DelegateMode = "cli" | "terminal";
export type DelegateStatus = "running" | "done" | "failed" | "killed";

export interface DelegateTask {
  id: string;
  title: string;
  prompt: string;
  mode: DelegateMode;
  agent?: string;
  effort?: string;
  workingDir: string;
  status: DelegateStatus;
  pid?: number;
  exitCode?: number;
  startedAt: number;
  endedAt?: number;
  lastMessage?: string;
}

interface DbRow {
  id: string;
  title: string;
  prompt: string;
  mode: string;
  agent: string | null;
  effort: string | null;
  working_dir: string;
  status: string;
  pid: number | null;
  exit_code: number | null;
  started_at: number;
  ended_at: number | null;
  last_message: string | null;
}

function rowToTask(r: DbRow): DelegateTask {
  return {
    id: r.id,
    title: r.title,
    prompt: r.prompt,
    mode: r.mode as DelegateMode,
    agent: r.agent ?? undefined,
    effort: r.effort ?? undefined,
    workingDir: r.working_dir,
    status: r.status as DelegateStatus,
    pid: r.pid ?? undefined,
    exitCode: r.exit_code ?? undefined,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined,
    lastMessage: r.last_message ?? undefined,
  };
}

// In-memory registry af kørende child-processer (for kill + stream)
const running = new Map<string, ChildProcessWithoutNullStreams>();

function ensureTasksRoot() {
  if (!existsSync(TASKS_ROOT)) {
    mkdirSync(TASKS_ROOT, { recursive: true });
  }
}

function makeTitle(prompt: string): string {
  const first = prompt.trim().split("\n")[0] || "Opgave";
  return first.length > 80 ? first.slice(0, 77) + "…" : first;
}

/**
 * Start en ny delegate-task.
 */
export function startTask(params: {
  prompt: string;
  mode?: DelegateMode;
  agent?: string;
  effort?: string;
  notifyOnDone?: boolean;
}): DelegateTask {
  const { prompt, mode = "cli", agent, effort, notifyOnDone = true } = params;
  if (!prompt.trim()) throw new Error("prompt mangler");

  ensureTasksRoot();
  const id = randomUUID();
  const workingDir = path.join(TASKS_ROOT, id);
  mkdirSync(workingDir, { recursive: true });

  const now = Date.now();
  const title = makeTitle(prompt);

  getDb()
    .prepare(
      `INSERT INTO delegate_tasks
       (id, title, prompt, mode, agent, effort, working_dir, status, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)`
    )
    .run(id, title, prompt, mode, agent ?? null, effort ?? null, workingDir, now);

  if (mode === "terminal") {
    spawnTerminal(id, workingDir, prompt).catch((e) => {
      markDone(id, "failed", -1, e instanceof Error ? e.message : String(e));
    });
  } else {
    spawnCli(id, workingDir, prompt, agent, effort, notifyOnDone);
  }

  return getTask(id)!;
}

function spawnCli(
  id: string,
  workingDir: string,
  prompt: string,
  agent: string | undefined,
  effort: string | undefined,
  notifyOnDone: boolean
) {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--add-dir",
    workingDir,
  ];
  if (agent) args.push("--agent", agent);
  if (effort) args.push("--effort", effort);

  // Selve prompten som sidste arg
  args.push(prompt);

  const child = spawn(CLAUDE_BIN, args, {
    cwd: workingDir,
    env: { ...process.env },
    // Ingen stdio: "inherit" — vi streamer manuelt
  }) as ChildProcessWithoutNullStreams;

  running.set(id, child);

  const logPath = path.join(workingDir, LOG_FILENAME);
  const logStream = createWriteStream(logPath, { flags: "a" });

  getDb().prepare(`UPDATE delegate_tasks SET pid = ? WHERE id = ?`).run(child.pid ?? null, id);

  let lastAssistantSnippet = "";

  child.stdout.on("data", (chunk: Buffer) => {
    const s = chunk.toString("utf8");
    logStream.write(s);
    // Prøv at pluk seneste assistant-tekst som last_message
    for (const line of s.split("\n")) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev?.type === "assistant" && ev?.message?.content) {
          const content = ev.message.content;
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c?.type === "text" && typeof c.text === "string") {
                lastAssistantSnippet = c.text.slice(-400);
              }
            }
          }
        }
      } catch {
        // ikke JSON — ignorér
      }
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    logStream.write(`[stderr] ${chunk.toString("utf8")}`);
  });

  child.on("error", (err) => {
    logStream.write(`[error] ${err.message}\n`);
    logStream.end();
    running.delete(id);
    markDone(id, "failed", -1, err.message);
    if (notifyOnDone) pushDone(id, "failed", err.message);
  });

  child.on("close", (code) => {
    logStream.end();
    running.delete(id);
    const status: DelegateStatus =
      code === 0 ? "done" : code === null ? "killed" : "failed";
    markDone(id, status, code ?? -1, lastAssistantSnippet || undefined);
    if (notifyOnDone) pushDone(id, status, lastAssistantSnippet);
  });
}

async function spawnTerminal(id: string, workingDir: string, prompt: string): Promise<void> {
  // Åbn nyt Terminal-vindue med interaktiv claude-session i tasks working dir.
  // Prompten escapes til AppleScript.
  const escCwd = workingDir.replace(/"/g, '\\"');
  const escPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
  const command = `cd "${escCwd}" && ${CLAUDE_BIN} "${escPrompt}"`;

  const script = `tell application "Terminal"
  activate
  do script "${command.replace(/"/g, '\\"')}"
end tell`;

  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/osascript", ["-e", script]);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`osascript exit ${code}`));
    });
  });

  // Terminal-mode: vi kan ikke tracke færdig fra Skynet. Marker som "done" straks.
  markDone(id, "done", 0, "Åbnet i Terminal — se vindue for resultat");
}

function markDone(id: string, status: DelegateStatus, exitCode: number, lastMessage?: string) {
  getDb()
    .prepare(
      `UPDATE delegate_tasks SET status = ?, exit_code = ?, ended_at = ?, last_message = COALESCE(?, last_message) WHERE id = ?`
    )
    .run(status, exitCode, Date.now(), lastMessage ?? null, id);
}

async function pushDone(id: string, status: DelegateStatus, snippet?: string) {
  const t = getTask(id);
  if (!t) return;
  const emoji = status === "done" ? "✅" : status === "killed" ? "🛑" : "❌";
  try {
    await notify({
      title: `${emoji} Delegate: ${t.title}`,
      body: snippet ? snippet.slice(0, 400) : `Task ${status}`,
      priority: status === "done" ? "default" : "high",
      tag: "delegate",
    });
  } catch {
    // ignorér notify-fejl
  }
}

/** Stop en kørende task. */
export function killTask(id: string): boolean {
  const child = running.get(id);
  if (!child) return false;
  child.kill("SIGTERM");
  // Giv den 2 sek, så forcer
  setTimeout(() => {
    if (running.has(id)) {
      try {
        running.get(id)?.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }, 2000);
  return true;
}

export function getTask(id: string): DelegateTask | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM delegate_tasks WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return row ? rowToTask(row) : undefined;
}

export function listTasks(limit = 50): DelegateTask[] {
  const rows = getDb()
    .prepare(`SELECT * FROM delegate_tasks ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as DbRow[];
  return rows.map(rowToTask);
}

/** Få sti til stream-log for en task. Null hvis ikke findes. */
export function getLogPath(id: string): string | null {
  const t = getTask(id);
  if (!t) return null;
  const p = path.join(t.workingDir, LOG_FILENAME);
  return existsSync(p) ? p : null;
}

export interface Artifact {
  name: string;
  relPath: string;
  size: number;
  modified: number;
  isDir: boolean;
}

/** List filer i task's working dir (rekursivt, ekskl. stream-log og skjulte). */
export function listArtifacts(id: string): Artifact[] {
  const t = getTask(id);
  if (!t || !existsSync(t.workingDir)) return [];
  const out: Artifact[] = [];
  walk(t.workingDir, "");
  function walk(dir: string, rel: string) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".")) continue;
      const abs = path.join(dir, entry);
      const relPath = rel ? path.join(rel, entry) : entry;
      const st = statSync(abs);
      if (st.isDirectory()) {
        out.push({
          name: entry,
          relPath,
          size: 0,
          modified: st.mtimeMs,
          isDir: true,
        });
        walk(abs, relPath);
      } else {
        out.push({
          name: entry,
          relPath,
          size: st.size,
          modified: st.mtimeMs,
          isDir: false,
        });
      }
    }
  }
  // Sortér efter modified desc
  out.sort((a, b) => b.modified - a.modified);
  return out;
}

/** Sikker sti-opløsning — beskytter mod path traversal. */
export function resolveArtifactPath(id: string, relPath: string): string | null {
  const t = getTask(id);
  if (!t) return null;
  const base = path.resolve(t.workingDir);
  const target = path.resolve(base, relPath);
  if (!target.startsWith(base + path.sep) && target !== base) return null;
  if (!existsSync(target)) return null;
  return target;
}

export function isRunning(id: string): boolean {
  return running.has(id);
}
