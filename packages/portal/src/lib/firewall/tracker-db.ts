/**
 * DuckDuckGo Tracker Radar — TDS (Tracker Data Set) lookup.
 *
 * Open source database fra DuckDuckGo med 3000+ trackers og 2800+ entities
 * (firmaer der ejer tracker-domæner). Distribueret som single JSON-fil under
 * Apache 2.0.
 *
 * Datakilder:
 *   - https://staticcdn.duckduckgo.com/trackerblocking/v5/current/ios-tds.json
 *     (~3 MB, kræver browser User-Agent)
 *
 * Vi cacher i data/firewall/tds.json + reload'er i memory dagligt.
 */

import { promises as fs } from "fs";
import path from "path";
import { homedir } from "os";

// ── Types (subset af det vi bruger) ──────────────────────────────────────────

interface TDSOwner {
  name: string;
  displayName: string;
  ownedBy?: string;
}

interface TDSTracker {
  domain: string;
  owner: TDSOwner;
  prevalence?: number;
  fingerprinting?: number;
  cookies?: number;
  categories?: string[];
  default?: "block" | "ignore";
}

interface TDSEntity {
  domains?: string[];
  prevalence?: number;
  displayName?: string;
}

interface TDSDomain {
  owner?: TDSOwner;
  fingerprinting?: number;
  cookies?: number;
  categories?: string[];
  default?: "block" | "ignore";
}

interface TDSData {
  trackers: Record<string, TDSTracker>;
  entities: Record<string, TDSEntity>;
  domains: Record<string, TDSDomain>;
  _builtWith?: Record<string, string>;
}

export interface TrackerLookup {
  /** True hvis domæne (eller parent-domæne) er kendt tracker. */
  isTracker: boolean;
  /** True hvis vi har info, men ikke nødvendigvis tracker. */
  isKnown: boolean;
  domain?: string;            // matched parent domain (fx 'google-analytics.com')
  owner?: string;             // 'Google LLC'
  ownerDisplay?: string;      // 'Google Analytics (Google)'
  categories?: string[];      // ['Advertising', 'Analytics']
  prevalence?: number;        // 0..1 — hvor almindelig på det åbne web
  fingerprinting?: number;    // 0..3 — hvor aggressiv fingerprinting
  defaultAction?: "block" | "ignore";
  /** "tracker" | "owned-by-entity" | "unknown" */
  classification: string;
}

// ── State ────────────────────────────────────────────────────────────────────

const TDS_URLS = [
  "https://staticcdn.duckduckgo.com/trackerblocking/v5/current/ios-tds.json",
  "https://staticcdn.duckduckgo.com/trackerblocking/v5/current/extension-tds.json",
];
const REFRESH_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_DIR = path.join(homedir(), "Desktop", "Claude", "projekter", "skynet", "packages", "portal", "data", "firewall");
const CACHE_FILE = path.join(CACHE_DIR, "tds.json");

interface State {
  data: TDSData | null;
  loadedAt: number | null;
  loading: Promise<void> | null;
  /** entity-name → list of owned domains, lowercase */
  entityDomainsLower: Map<string, string[]>;
  /** lowercase-domain → entity-name */
  domainToEntity: Map<string, string>;
}

const STATE_KEY = "__skynet_tds_state__";
function getState(): State {
  const g = globalThis as unknown as Record<string, State>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      data: null,
      loadedAt: null,
      loading: null,
      entityDomainsLower: new Map(),
      domainToEntity: new Map(),
    };
  }
  return g[STATE_KEY];
}

// ── Loading ──────────────────────────────────────────────────────────────────

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readCachedTds(): Promise<TDSData | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as TDSData;
  } catch {
    return null;
  }
}

async function fetchFreshTds(): Promise<TDSData | null> {
  for (const url of TDS_URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as TDSData;
      if (json.trackers && json.entities) return json;
    } catch { /* try next URL */ }
  }
  return null;
}

async function persistTds(data: TDSData): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(CACHE_FILE, JSON.stringify(data));
}

function buildIndices(state: State): void {
  if (!state.data) return;
  state.entityDomainsLower.clear();
  state.domainToEntity.clear();
  for (const [name, ent] of Object.entries(state.data.entities)) {
    if (!ent.domains) continue;
    const lower = ent.domains.map((d) => d.toLowerCase());
    state.entityDomainsLower.set(name, lower);
    for (const d of lower) state.domainToEntity.set(d, name);
  }
}

async function loadInternal(): Promise<void> {
  const state = getState();

  // 1) Try disk cache first — fast path
  const cached = await readCachedTds();
  if (cached) {
    state.data = cached;
    state.loadedAt = Date.now();
    buildIndices(state);
  }

  // 2) Refresh if stale (or first-ever load failed)
  const stale = !state.loadedAt || Date.now() - state.loadedAt > REFRESH_MS || !cached;
  if (stale) {
    const fresh = await fetchFreshTds();
    if (fresh) {
      state.data = fresh;
      state.loadedAt = Date.now();
      buildIndices(state);
      void persistTds(fresh).catch((e) => console.warn("[tracker-db] persist failed:", e));
    }
  }
}

export async function ensureLoaded(): Promise<void> {
  const state = getState();
  if (state.loading) return state.loading;
  if (state.data && state.loadedAt && Date.now() - state.loadedAt < REFRESH_MS) return;
  state.loading = loadInternal().finally(() => {
    state.loading = null;
  });
  await state.loading;
}

// ── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Slå et hostname op. Strategi:
 *   1. Direct match i `trackers[host]`
 *   2. Walk parent domains: foo.bar.tracker.com → bar.tracker.com → tracker.com
 *   3. Fallback til `domains[host]` + parent walk
 *   4. Fallback til entity-lookup via domains-listen
 */
export function lookupHost(hostname: string): TrackerLookup {
  const state = getState();
  if (!state.data) {
    return { isTracker: false, isKnown: false, classification: "unknown" };
  }

  const lower = hostname.toLowerCase().replace(/\.$/, "");
  const parts = lower.split(".");

  // Generate parent-domain candidates: a.b.c → ['a.b.c', 'b.c']
  const candidates: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    candidates.push(parts.slice(i).join("."));
  }
  if (candidates[0]?.startsWith("www.")) candidates.unshift(candidates[0].slice(4));

  // Pass 1 — explicit trackers
  for (const c of candidates) {
    const t = state.data.trackers[c];
    if (t) {
      return {
        isTracker: true,
        isKnown: true,
        domain: t.domain,
        owner: t.owner.ownedBy ?? t.owner.name,
        ownerDisplay: t.owner.displayName,
        categories: t.categories,
        prevalence: t.prevalence,
        fingerprinting: t.fingerprinting,
        defaultAction: t.default,
        classification: "tracker",
      };
    }
  }

  // Pass 2 — generic domains (some marked tracker via category)
  for (const c of candidates) {
    const d = state.data.domains[c];
    if (d) {
      const isTracker =
        d.default === "block" ||
        (d.categories?.some((cat) => /Advertising|Analytics|Tracking|Audience/i.test(cat)) ?? false);
      return {
        isTracker,
        isKnown: true,
        domain: c,
        owner: d.owner?.ownedBy ?? d.owner?.name,
        ownerDisplay: d.owner?.displayName ?? d.owner?.name,
        categories: d.categories,
        fingerprinting: d.fingerprinting,
        defaultAction: d.default,
        classification: isTracker ? "tracker" : "owned-by-entity",
      };
    }
  }

  // Pass 3 — direct entity lookup (Google's misc domains, etc.)
  for (const c of candidates) {
    const entityName = state.domainToEntity.get(c);
    if (entityName) {
      const ent = state.data.entities[entityName];
      return {
        isTracker: false,
        isKnown: true,
        domain: c,
        owner: entityName,
        ownerDisplay: ent.displayName ?? entityName,
        prevalence: ent.prevalence,
        classification: "owned-by-entity",
      };
    }
  }

  return { isTracker: false, isKnown: false, classification: "unknown" };
}

export function getTdsStatus() {
  const state = getState();
  return {
    loaded: !!state.data,
    loadedAt: state.loadedAt,
    trackerCount: state.data ? Object.keys(state.data.trackers).length : 0,
    entityCount: state.data ? Object.keys(state.data.entities).length : 0,
    domainCount: state.data ? Object.keys(state.data.domains).length : 0,
    builtWith: state.data?._builtWith ?? null,
  };
}
