import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { ClaudeSessionSummary, ClaudeStatusData, ClaudeRateLimit, ClaudeRateLimits, TokenBucket, ClaudeLiveWindows } from "@/lib/types";
import { getSetting, setSetting } from "@/lib/settings";

const PROJECTS_DIR = path.join(os.homedir(), ".claude/projects");
const STATS_CACHE = path.join(os.homedir(), ".claude/stats-cache.json");
const RATE_LIMITS_CACHE = path.join(os.homedir(), ".claude/rate-limits.json");

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

function humanizeResetIn(resetsAtMs: number | null): string {
  if (!resetsAtMs) return "";
  const diff = resetsAtMs - Date.now();
  // Tidspunkt i fortiden → nulstillingen er sket; den gemte usedPercent er
  // dermed irrelevant (eller gammel snapshot). Vis ingen "om X" tekst — det
  // skulle være tydeligt at værdien ikke er live længere.
  if (diff < 0) return "udløbet";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "nu";
  if (mins < 60) return `om ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `om ${hours}t`;
  const days = Math.round(hours / 24);
  return `om ${days}d`;
}

interface RawRateBucket {
  used_percentage?: number | null;
  resets_at?: number | null;
}

interface RawRateLimitsFile {
  rate_limits?: {
    five_hour?: RawRateBucket;
    seven_day?: RawRateBucket;
    seven_day_opus?: RawRateBucket;
  };
  updated_at?: number;
}

function toBucket(raw: RawRateBucket | undefined): ClaudeRateLimit | null {
  if (!raw) return null;
  const usedPct = typeof raw.used_percentage === "number" ? raw.used_percentage : null;
  const resetsAtSec = typeof raw.resets_at === "number" ? raw.resets_at : null;
  // Claude Code sender resets_at i sekunder — normaliser til ms
  const resetsAtMs = resetsAtSec ? resetsAtSec * 1000 : null;
  if (usedPct == null && resetsAtMs == null) return null;
  return {
    usedPercent: usedPct ?? 0,
    resetsAt: resetsAtMs,
    resetsIn: humanizeResetIn(resetsAtMs),
  };
}

async function readRateLimits(): Promise<ClaudeRateLimits | null> {
  try {
    const raw = await fs.readFile(RATE_LIMITS_CACHE, "utf8");
    const d = JSON.parse(raw) as RawRateLimitsFile;
    const rl = d.rate_limits ?? {};
    const updatedAt = (d.updated_at ?? 0) * 1000; // sek → ms
    const ageMs = Date.now() - updatedAt;
    const stale = ageMs > 24 * 60 * 60_000;
    return {
      fiveHour: toBucket(rl.five_hour),
      sevenDay: toBucket(rl.seven_day),
      sevenDayOpus: toBucket(rl.seven_day_opus),
      updatedAt,
      stale,
    };
  } catch {
    return null;
  }
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

/**
 * Når rate-limits.json viser fx '42% brugt af 5h' og vi i samme periode
 * har talt X tokens i JSONL, kan vi udlede plan-grænsen: X / (42/100).
 *
 * Vi cacher resultatet i settings ('plan_limit_5h', 'plan_limit_7d') så
 * vi kan beregne live procent selv når rate-limits.json er stale.
 *
 * Kun cross-reference når rate-limits.json IKKE er stale (< 24t gammel)
 * og usedPercent > 0 (ellers division-by-zero / fejlagtig grænse).
 */
function deriveAndCacheLimit(
  cacheKey: string,
  windowTokens: number,
  bucket: ClaudeRateLimit | null | undefined,
  stale: boolean | undefined,
): number | null {
  // Læs cached grænse — fallback hvis vi ikke har nyt cross-reference
  const cached = parseInt(getSetting(cacheKey) ?? "0", 10);
  const cachedLimit = Number.isFinite(cached) && cached > 0 ? cached : null;

  // Update cache hvis vi har fresh rate-limits + meaningful usedPercent
  if (!stale && bucket && bucket.usedPercent > 1 && windowTokens > 1000) {
    const derived = Math.round(windowTokens / (bucket.usedPercent / 100));
    if (derived > 0 && Number.isFinite(derived)) {
      // Smooth: behold den højere af gamle og nye estimat (limits stiger
      // ikke ned, og vi vil hellere underestimere usage end overestimere)
      const next = cachedLimit ? Math.max(cachedLimit, derived) : derived;
      if (next !== cachedLimit) setSetting(cacheKey, String(next));
      return next;
    }
  }

  return cachedLimit;
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
  // Live-windows = ruller med "nu"
  const nowMs = now.getTime();
  const fiveHourWindowStart = nowMs - 5 * 60 * 60 * 1000;
  const sevenDayWindowStart = nowMs - 7 * 24 * 60 * 60 * 1000;

  const [files, statsCache, rateLimits] = await Promise.all([listAllJsonl(), readStatsCache(), readRateLimits()]);

  const total = statsCache ? { ...statsCache.bucket } : emptyBucket();
  const statsCutoff = statsCache?.cutoffMs ?? 0;
  const today = emptyBucket();
  const week = emptyBucket();
  const ytd = emptyBucket();
  const fiveH = emptyBucket();
  const sevenD = emptyBucket();
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
        // Rullende live-vinduer fra "nu"
        if (ts >= fiveHourWindowStart) addToBucket(fiveH, u);
        if (ts >= sevenDayWindowStart) addToBucket(sevenD, u);

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

  // Beregn / opdater udledte plan-grænser ved cross-reference: hvis
  // rate-limits.json IKKE er stale OG den har en usedPercent: vi har
  // 'X tokens i vinduet → Y%' og kan udlede 'plan = X / (Y/100)'.
  const fiveHourPlan = deriveAndCacheLimit("plan_limit_5h", fiveH.total, rateLimits?.fiveHour, rateLimits?.stale);
  const sevenDayPlan = deriveAndCacheLimit("plan_limit_7d", sevenD.total, rateLimits?.sevenDay, rateLimits?.stale);

  const liveWindows: ClaudeLiveWindows = {
    fiveHour: {
      tokens: fiveH.total,
      messages: fiveH.messages,
      windowMs: 5 * 60 * 60 * 1000,
      planLimit: fiveHourPlan,
      estimatedPercent: fiveHourPlan ? Math.min(100, Math.round((fiveH.total / fiveHourPlan) * 100 * 10) / 10) : null,
    },
    sevenDay: {
      tokens: sevenD.total,
      messages: sevenD.messages,
      windowMs: 7 * 24 * 60 * 60 * 1000,
      planLimit: sevenDayPlan,
      estimatedPercent: sevenDayPlan ? Math.min(100, Math.round((sevenD.total / sevenDayPlan) * 100 * 10) / 10) : null,
    },
  };

  return {
    total,
    today,
    week,
    yearToDate: ytd,
    dailyTotals,
    recent,
    rateLimits,
    liveWindows,
    fetchedAt: new Date().toISOString(),
  };
}
