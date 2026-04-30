/**
 * Claude Code session-helper.
 *
 * Læser ~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl og udtrækker:
 *   - sidste user-prompt
 *   - sidste assistant-svar (tekst, ikke tool_use)
 *   - tools brugt i denne session
 *   - varighed
 *   - antal messages
 *
 * Bruges af /api/agent-events til at lave detaljerede push-notifikationer
 * når Claude Code er færdig, og af /continue/<sessionId>-siden.
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";

const PROJECTS_DIR = path.join(os.homedir(), ".claude/projects");

export interface SessionSummary {
  sessionId: string;
  cwd?: string;
  /** Project-mappens navn (sidste segment af cwd) */
  project?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
  messageCount: number;
  /** Sidste user-prompt (op til 600 tegn). Null hvis ikke fundet. */
  lastUserMessage: string | null;
  /** Sidste assistant text-svar (op til 600 tegn). Null hvis ikke fundet. */
  lastAssistantMessage: string | null;
  /** Unikke tool-navne brugt i sessionen, max 12 */
  toolsUsed: string[];
  /** Sti til JSONL-filen — bruges af /continue/<id>-siden */
  jsonlPath?: string;
}

interface JsonlEntry {
  type?: string;
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
}

/**
 * Sanitize cwd til den mappe-navne-formatering Claude Code bruger:
 * '/Users/parthee/Desktop/Claude' → '-Users-parthee-Desktop-Claude'
 */
function sanitizeCwd(cwd: string): string {
  return cwd.replace(/[/\s]/g, "-").replace(/-+/g, "-");
}

/** Hent indhold ud af "content"-feltet — kan være string eller array af parts */
function extractContent(content: unknown, opts: { tools?: Set<string> } = {}): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const p of content as Array<Record<string, unknown>>) {
    if (typeof p.text === "string") {
      parts.push(p.text);
    } else if (p.type === "tool_use" && typeof p.name === "string") {
      opts.tools?.add(p.name);
    }
  }
  return parts.join("\n").trim();
}

function tryParse(line: string): JsonlEntry | null {
  try {
    return JSON.parse(line) as JsonlEntry;
  } catch {
    return null;
  }
}

async function findSessionFile(sessionId: string, cwdHint?: string): Promise<string | null> {
  // 1) Hvis cwd er givet: prøv direkte path først
  if (cwdHint) {
    const candidate = path.join(PROJECTS_DIR, sanitizeCwd(cwdHint), `${sessionId}.jsonl`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* fortsæt til glob-søgning */
    }
  }
  // 2) Fallback: walk projects-dir, find filen ved navn
  let dirs: import("fs").Dirent[];
  try {
    dirs = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const candidate = path.join(PROJECTS_DIR, d.name, `${sessionId}.jsonl`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* fortsæt */
    }
  }
  return null;
}

export async function getSessionSummary(sessionId: string, cwdHint?: string): Promise<SessionSummary | null> {
  const filePath = await findSessionFile(sessionId, cwdHint);
  if (!filePath) return null;

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const tools = new Set<string>();
  let lastUser: string | null = null;
  let lastAssistant: string | null = null;
  let firstTs: string | undefined;
  let lastTs: string | undefined;
  let messageCount = 0;
  let detectedCwd: string | undefined = cwdHint;

  const lines = raw.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const entry = tryParse(line);
    if (!entry) continue;
    if (entry.cwd && !detectedCwd) detectedCwd = entry.cwd;
    if (entry.timestamp) {
      if (!firstTs) firstTs = entry.timestamp;
      lastTs = entry.timestamp;
    }
    if (entry.type === "user") {
      messageCount += 1;
      const txt = extractContent(entry.message?.content);
      if (txt) lastUser = txt;
    } else if (entry.type === "assistant") {
      messageCount += 1;
      const txt = extractContent(entry.message?.content, { tools });
      if (txt) lastAssistant = txt;
    }
  }

  const startedAt = firstTs;
  const endedAt = lastTs;
  const durationMs = startedAt && endedAt ? Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)) : 0;

  const truncate = (s: string | null, max = 600): string | null =>
    s ? (s.length > max ? s.slice(0, max - 1) + "…" : s) : null;

  return {
    sessionId,
    cwd: detectedCwd,
    project: detectedCwd ? path.basename(detectedCwd) : undefined,
    startedAt,
    endedAt,
    durationMs,
    messageCount,
    lastUserMessage: truncate(lastUser),
    lastAssistantMessage: truncate(lastAssistant),
    toolsUsed: [...tools].slice(0, 12),
    jsonlPath: filePath,
  };
}

/** Format kort SMS-venlig sammenfatning til notifikationer (max ~500 tegn) */
export function formatSummaryForPush(s: SessionSummary): { title: string; body: string } {
  const project = s.project ?? "session";
  const dur = formatDuration(s.durationMs);
  const tools = s.toolsUsed.length > 0
    ? `\nTools: ${s.toolsUsed.slice(0, 6).join(", ")}${s.toolsUsed.length > 6 ? "…" : ""}`
    : "";
  const userPreview = s.lastUserMessage
    ? `\nDu: ${truncate(s.lastUserMessage, 120)}`
    : "";
  const assistantPreview = s.lastAssistantMessage
    ? `\nClaude: ${truncate(s.lastAssistantMessage, 200)}`
    : "";
  return {
    title: `✅ Claude Code færdig · ${project}`,
    body: `${s.messageCount} msg · ${dur}${tools}${userPreview}${assistantPreview}`,
  };
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
