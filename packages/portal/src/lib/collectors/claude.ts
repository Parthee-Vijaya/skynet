import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { ClaudeSessionSummary, ClaudeStatusData, TokenBucket } from "@/lib/types";

const PROJECTS_DIR = path.join(os.homedir(), ".claude/projects");
const STATS_CACHE = path.join(os.homedir(), ".claude/stats-cache.json");

interface StatsCacheModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

interface StatsCache {
  modelUsage?: Record<string, StatsCacheModelUsage>;
  totalMessages?: number;
  lastComputedDate?: string;
}

interface StatsCacheResult {
  bucket: TokenBucket;
  cutoffMs: number;
}

async function readStatsCache(): Promise<StatsCacheResult | null> {
  try {
    const raw = await fs.readFile(STATS_CACHE, "utf8");
    const d = JSON.parse(raw) as StatsCache;
    const b = emptyBucket();
    for (const v of Object.values(d.modelUsage ?? {})) {
      b.in += v.inputTokens ?? 0;
      b.out += v.outputTokens ?? 0;
      b.cacheRead += v.cacheReadInputTokens ?? 0;
      b.cacheCreate += v.cacheCreationInputTokens ?? 0;
    }
    b.total = b.in + b.out + b.cacheRead + b.cacheCreate;
    b.messages = d.totalMessages ?? 0;
    let cutoffMs = 0;
    if (d.lastComputedDate) {
      const [y, m, day] = d.lastComputedDate.split("-").map(Number);
      cutoffMs = new Date(y, (m ?? 1) - 1, (day ?? 1) + 1).getTime();
    }
    return { bucket: b, cutoffMs };
  } catch {
    return null;
  }
}

interface JsonlEntry {
  type?: string;
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

function emptyBucket(): TokenBucket {
  return { in: 0, out: 0, cacheRead: 0, cacheCreate: 0, total: 0, messages: 0 };
}

function addToBucket(b: TokenBucket, u: { in: number; out: number; cR: number; cC: number }) {
  b.in += u.in;
  b.out += u.out;
  b.cacheRead += u.cR;
  b.cacheCreate += u.cC;
  b.total += u.in + u.out + u.cR + u.cC;
  b.messages += 1;
}

async function walkJsonl(dir: string, out: string[]): Promise<void> {
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walkJsonl(p, out);
    } else if (e.isFile() && e.name.endsWith(".jsonl")) {
      out.push(p);
    }
  }
}

async function listAllJsonl(): Promise<string[]> {
  const out: string[] = [];
  await walkJsonl(PROJECTS_DIR, out);
  return out;
}

interface SessionAgg {
  sessionId: string;
  project: string;
  startedTs: number;
  endedTs: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheCreate: number;
  messageCount: number;
}

export async function collect(): Promise<ClaudeStatusData> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfDay - 6 * 24 * 60 * 60 * 1000;
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

  const [files, statsCache] = await Promise.all([listAllJsonl(), readStatsCache()]);

  const total = statsCache ? { ...statsCache.bucket } : emptyBucket();
  const statsCutoff = statsCache?.cutoffMs ?? 0;
  const today = emptyBucket();
  const week = emptyBucket();
  const ytd = emptyBucket();
  const dailyMap = new Map<string, number>();
  const sessions = new Map<string, SessionAgg>();

  await Promise.all(
    files.map(async (filePath) => {
      let raw: string;
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch {
        return;
      }
      const lines = raw.split("\n");
      const fallbackSession = path.basename(filePath, ".jsonl");

      for (const line of lines) {
        if (!line.trim()) continue;
        let entry: JsonlEntry;
        try {
          entry = JSON.parse(line) as JsonlEntry;
        } catch {
          continue;
        }
        if (entry.type !== "assistant") continue;
        const usage = entry.message?.usage;
        if (!usage) continue;

        const u = {
          in: usage.input_tokens ?? 0,
          out: usage.output_tokens ?? 0,
          cR: usage.cache_read_input_tokens ?? 0,
          cC: usage.cache_creation_input_tokens ?? 0,
        };

        const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;

        if (!statsCache || (ts && ts >= statsCutoff)) {
          addToBucket(total, u);
        }

        if (!ts) continue;

        if (ts >= startOfYear) addToBucket(ytd, u);
        if (ts >= startOfWeek) {
          addToBucket(week, u);
          const d = new Date(ts);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          dailyMap.set(key, (dailyMap.get(key) ?? 0) + u.in + u.out + u.cR + u.cC);
        }
        if (ts >= startOfDay) addToBucket(today, u);

        const sessionId = entry.sessionId ?? fallbackSession;
        const project = entry.cwd ? path.basename(entry.cwd) : path.basename(path.dirname(filePath));
        const existing = sessions.get(sessionId);
        if (existing) {
          existing.tokensIn += u.in;
          existing.tokensOut += u.out;
          existing.cacheRead += u.cR;
          existing.cacheCreate += u.cC;
          existing.messageCount += 1;
          if (ts < existing.startedTs) existing.startedTs = ts;
          if (ts > existing.endedTs) existing.endedTs = ts;
        } else {
          sessions.set(sessionId, {
            sessionId,
            project,
            startedTs: ts,
            endedTs: ts,
            tokensIn: u.in,
            tokensOut: u.out,
            cacheRead: u.cR,
            cacheCreate: u.cC,
            messageCount: 1,
          });
        }
      }
    })
  );

  const dailyTotals: Array<{ date: string; tokens: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(startOfDay - i * 24 * 60 * 60 * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dailyTotals.push({ date: key, tokens: dailyMap.get(key) ?? 0 });
  }

  const sortedSessions = [...sessions.values()].sort((a, b) => b.endedTs - a.endedTs);
  const recent: ClaudeSessionSummary[] = sortedSessions.slice(0, 3).map((s) => ({
    sessionId: s.sessionId,
    project: s.project,
    startedAt: new Date(s.startedTs).toISOString(),
    endedAt: new Date(s.endedTs).toISOString(),
    durationMs: Math.max(0, s.endedTs - s.startedTs),
    tokensIn: s.tokensIn,
    tokensOut: s.tokensOut,
    cacheRead: s.cacheRead,
    cacheCreate: s.cacheCreate,
    messageCount: s.messageCount,
  }));

  return {
    total,
    today,
    week,
    yearToDate: ytd,
    dailyTotals,
    recent,
    fetchedAt: new Date().toISOString(),
  };
}
