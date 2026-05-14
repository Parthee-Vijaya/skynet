import { runAgent } from "@/lib/agent/langchain-runner";
import { getDb } from "@/lib/db";

export interface ExplanationResult {
  category: string;          // 'tracker' | 'cdn' | 'cloud' | 'analytics' | 'ad' | 'updates' | 'unknown' | …
  trust_score: number;       // 0-10 (10 = sikker, 0 = mistænkelig)
  summary: string;           // 1-3 sætninger på dansk
  sources?: string[];        // hvis web_search blev brugt
  cached: boolean;
  cached_at?: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 timer

function cacheKey(host: string, app?: string | null): string {
  return `firewall_explain:${host}:${app ?? ""}`;
}

interface CacheRow { value: string; expires_at: number }

function getCached(key: string): ExplanationResult | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value, expires_at FROM cache WHERE key = ? AND expires_at > ?")
    .get(key, Date.now()) as CacheRow | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as Omit<ExplanationResult, "cached" | "cached_at">;
    return { ...parsed, cached: true, cached_at: row.expires_at - TTL_MS };
  } catch {
    return null;
  }
}

function putCached(key: string, payload: Omit<ExplanationResult, "cached" | "cached_at">): void {
  getDb()
    .prepare(
      "INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at"
    )
    .run(key, JSON.stringify(payload), Date.now() + TTL_MS);
}

const SYSTEM_PROMPT = `Du er en privatlivs-orienteret network forensics-assistent.

Brugeren sender dig en remote host (domæne eller IP) og evt. den app der kontaktede den.
Din opgave: forklar kort på dansk hvad host'en gør, og om det er suspekt.

Brug web_search-tool'et hvis du ikke kender host'en. Vær konkret.

Svar SKAL være valid JSON i præcis dette format (ingen markdown, ingen kodeblok-mærker):
{
  "category": "tracker|cdn|cloud|analytics|ad|updates|api|telemetry|unknown",
  "trust_score": 0-10,
  "summary": "1-2 korte sætninger på dansk",
  "sources": ["url1", "url2"]
}

Trust score:
- 10 = velkendt og legitim (Apple, Google CDN, kendt cloud-provider)
- 7-9 = legitim API/telemetry for kendt app
- 4-6 = ukendt eller delvist suspekt
- 0-3 = kendt tracker, malware-relateret, eller stærkt suspekt

Vær kortfattet — én bruger ser dette mens de skal beslutte om de blokerer.`;

export async function explainConnection(host: string, app?: string | null): Promise<ExplanationResult> {
  const key = cacheKey(host, app);
  const cached = getCached(key);
  if (cached) return cached;

  const userMsg = app
    ? `App: ${app}\nRemote host: ${host}\n\nHvad er denne host og er det safe at appen kontakter den?`
    : `Remote host: ${host}\n\nHvad er denne host og er der noget mistænkeligt ved den?`;

  let result: Omit<ExplanationResult, "cached" | "cached_at">;
  try {
    const out = await runAgent({
      userMessage: userMsg,
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: 4,
      forceFirstTool: false,
      logTag: "firewall-explain",
      timeoutMs: 30_000,
    });
    result = parseExplanation(out.text, out.toolsUsed);
  } catch (e) {
    result = {
      category: "unknown",
      trust_score: 5,
      summary: `Kunne ikke kontakte LLM (${e instanceof Error ? e.message : String(e)}). Manuel inspektion anbefales.`,
      sources: [],
    };
  }

  putCached(key, result);
  return { ...result, cached: false };
}

function parseExplanation(text: string, toolsUsed: string[]): Omit<ExplanationResult, "cached" | "cached_at"> {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(stripped) as Partial<ExplanationResult>;
    return {
      category: typeof parsed.category === "string" ? parsed.category : "unknown",
      trust_score: typeof parsed.trust_score === "number" ? clamp(parsed.trust_score, 0, 10) : 5,
      summary: typeof parsed.summary === "string" ? parsed.summary : text.slice(0, 300),
      sources: Array.isArray(parsed.sources) ? parsed.sources.filter((s): s is string => typeof s === "string").slice(0, 5) : [],
    };
  } catch {
    return {
      category: "unknown",
      trust_score: 5,
      summary: text.slice(0, 300),
      sources: toolsUsed.includes("web_search") ? ["web_search"] : [],
    };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
