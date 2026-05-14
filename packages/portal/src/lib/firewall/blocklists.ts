/**
 * Domain-blocklists fra åbne kilder.
 *
 * Kilder (alle gratis, uden API-key):
 *   - OISD Big List   — kuratereret + dedupliceret aggregator
 *   - Steven Black    — unified hosts (ads + malware + tracking)
 *   - EasyPrivacy     — fokuseret på trackers
 *
 * Strategi:
 *   - Hent én gang i døgnet (cron via collector eller manuelt via /refresh)
 *   - Cache som JSON-array i data/firewall/blocklists/<id>.json
 *   - Ved boot: load alle aktive lister til ét stort in-memory Set<string>
 *     (typisk 200k-500k unique domains → ~30 MB heap)
 *   - lookup(host) walker parent-domains som tracker-db
 */

import { promises as fs } from "fs";
import path from "path";
import { homedir } from "os";
import { getDb } from "@/lib/db";

// ── Sources ──────────────────────────────────────────────────────────────────

export interface BlocklistSource {
  id: string;
  name: string;
  url: string;
  format: "oisd" | "hosts" | "adblock";
  description: string;
}

export const KNOWN_SOURCES: BlocklistSource[] = [
  {
    id: "oisd-small",
    name: "OISD Small",
    url: "https://small.oisd.nl/domainswild2",
    format: "oisd",
    description: "Kuratereret aggregator — kun tracking + ads (mindre falske positive)",
  },
  {
    id: "stevenblack",
    name: "Steven Black hosts (unified)",
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    format: "hosts",
    description: "Ads + malware + telemetry (~140k domæner)",
  },
  {
    id: "easyprivacy",
    name: "EasyPrivacy",
    url: "https://easylist.to/easylist/easyprivacy.txt",
    format: "adblock",
    description: "Trackers — kuratereret af EasyList-teamet",
  },
];

// ── State ────────────────────────────────────────────────────────────────────

const CACHE_DIR = path.join(homedir(), "Desktop", "Claude", "projekter", "aktive", "skynet", "packages", "portal", "data", "firewall", "blocklists");

interface State {
  /** Set af alle aktive blocklist-domains (lowercase). */
  domains: Set<string>;
  /** domain → source-name. Bruges af lookup() for nøjagtig source-attribution. */
  domainToSource: Map<string, string>;
  /** Per-list info — populated efter loadAll() */
  lists: Map<string, { sourceId: string; name: string; count: number; loadedAt: number }>;
  loadedAt: number | null;
  loading: Promise<void> | null;
}

const STATE_KEY = "__skynet_blocklists_state__";
function getState(): State {
  const g = globalThis as unknown as Record<string, State>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = { domains: new Set(), domainToSource: new Map(), lists: new Map(), loadedAt: null, loading: null };
  }
  return g[STATE_KEY];
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/** Hosts-file format: '0.0.0.0 evil.com' or '127.0.0.1 evil.com' */
function parseHosts(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(\S+)/);
    if (m && !m[1].startsWith("0.") && m[1] !== "localhost") {
      out.push(m[1].toLowerCase());
    }
  }
  return out;
}

/** OISD format: ren liste af domains, én pr. linje, ingen kommentarer */
function parseOisd(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    // OISD wildcard-format: '*.evil.com' → 'evil.com'
    const cleaned = line.replace(/^\*\./, "").toLowerCase();
    if (cleaned.includes(".") && !cleaned.includes("/")) {
      out.push(cleaned);
    }
  }
  return out;
}

/**
 * Adblock format (EasyPrivacy):
 *   ||tracker.com^               — block all subdomains
 *   ||tracker.com/path^          — path-baseret (skipped — vi laver kun domain-block)
 *   /scripts/track.js$third-party — element-rules (skipped)
 *
 * Vi tager kun rene `||domain^`-regler.
 */
function parseAdblock(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("!") || line.startsWith("[")) continue;
    const m = line.match(/^\|\|([a-z0-9.-]+)\^?$/);
    if (m) out.push(m[1].toLowerCase());
  }
  return out;
}

// ── Fetch + persist ──────────────────────────────────────────────────────────

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function fetchSource(src: BlocklistSource): Promise<string[] | null> {
  try {
    const res = await fetch(src.url, {
      headers: { "User-Agent": "Skynet-Firewall/1.0" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (src.format === "hosts") return parseHosts(text);
    if (src.format === "oisd") return parseOisd(text);
    return parseAdblock(text);
  } catch (e) {
    console.warn(`[blocklists] fetch ${src.id} failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export interface RefreshResult {
  sourceId: string;
  ok: boolean;
  count: number;
  error?: string;
  ms: number;
}

export async function refreshSource(sourceId: string): Promise<RefreshResult> {
  const t0 = Date.now();
  const src = KNOWN_SOURCES.find((s) => s.id === sourceId);
  if (!src) return { sourceId, ok: false, count: 0, error: "unknown source", ms: 0 };

  const domains = await fetchSource(src);
  if (!domains) return { sourceId, ok: false, count: 0, error: "fetch failed", ms: Date.now() - t0 };

  await ensureCacheDir();
  const cachedPath = path.join(CACHE_DIR, `${sourceId}.json`);
  await fs.writeFile(cachedPath, JSON.stringify(domains));

  // Persist meta i SQLite
  const db = getDb();
  db.prepare(
    `INSERT INTO network_blocklists (name, source_url, domain_count, enabled, fetched_at, cached_path)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       source_url = excluded.source_url,
       domain_count = excluded.domain_count,
       fetched_at = excluded.fetched_at,
       cached_path = excluded.cached_path`
  ).run(src.id, src.url, domains.length, Date.now(), cachedPath);

  // Reload in-memory cache
  await reloadInMemory();

  return { sourceId, ok: true, count: domains.length, ms: Date.now() - t0 };
}

export async function refreshAll(): Promise<RefreshResult[]> {
  return Promise.all(KNOWN_SOURCES.map((s) => refreshSource(s.id)));
}

// ── In-memory load ───────────────────────────────────────────────────────────

interface BlocklistRow {
  name: string;
  source_url: string;
  domain_count: number;
  enabled: number;
  fetched_at: number;
  cached_path: string;
}

async function reloadInMemory(): Promise<void> {
  const state = getState();
  const db = getDb();

  // Ensure unique constraint på name (one-time migration if needed)
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_netblocklists_name ON network_blocklists(name)`);
  } catch { /* idempotent */ }

  const rows = db
    .prepare("SELECT name, source_url, domain_count, enabled, fetched_at, cached_path FROM network_blocklists WHERE enabled = 1 AND cached_path IS NOT NULL")
    .all() as BlocklistRow[];

  state.domains.clear();
  state.domainToSource.clear();
  state.lists.clear();

  for (const row of rows) {
    try {
      const text = await fs.readFile(row.cached_path, "utf-8");
      const domains = JSON.parse(text) as string[];
      for (const d of domains) {
        state.domains.add(d);
        // Første kilde der ejer et givent domæne vinder (ingen overskrivning).
        // Dette giver deterministic source-attribution selv ved overlap.
        if (!state.domainToSource.has(d)) {
          state.domainToSource.set(d, row.name);
        }
      }
      state.lists.set(row.name, {
        sourceId: row.name,
        name: row.name,
        count: domains.length,
        loadedAt: row.fetched_at,
      });
    } catch (e) {
      console.warn(`[blocklists] load ${row.name} failed:`, e instanceof Error ? e.message : e);
    }
  }

  state.loadedAt = Date.now();
}

export async function ensureLoaded(): Promise<void> {
  const state = getState();
  if (state.loading) return state.loading;
  if (state.loadedAt && Date.now() - state.loadedAt < 12 * 3_600_000) return;
  state.loading = reloadInMemory().finally(() => {
    state.loading = null;
  });
  await state.loading;
}

// ── Lookup ───────────────────────────────────────────────────────────────────

export interface BlocklistMatch {
  blocked: boolean;
  matchedDomain?: string;
  source?: string;
}

export function lookup(hostname: string): BlocklistMatch {
  const state = getState();
  if (state.domains.size === 0) return { blocked: false };

  const lower = hostname.toLowerCase().replace(/\.$/, "");
  const parts = lower.split(".");

  // Walk parent domains (foo.bar.tracker.com → bar.tracker.com → tracker.com)
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (state.domains.has(candidate)) {
      return {
        blocked: true,
        matchedDomain: candidate,
        source: state.domainToSource.get(candidate),
      };
    }
  }

  return { blocked: false };
}

export function getStatus() {
  const state = getState();
  return {
    loaded: state.domains.size > 0,
    loadedAt: state.loadedAt,
    totalDomains: state.domains.size,
    lists: [...state.lists.values()],
    sources: KNOWN_SOURCES,
  };
}
