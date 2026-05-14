/**
 * Reverse-DNS resolver med in-memory cache.
 *
 * Brugt af network-collector til at populere `rhost`-kolonnen på
 * `network_connections`. Uden rhost virker DDG Tracker Radar og
 * blocklist-lookup ikke (de behøver hostname, ikke kun IP).
 *
 * Design:
 *   - Cache: Map<ip, { hostname: string | null, expiresAt: number }>
 *     1h TTL for hits, 5min for misses (NXDOMAIN cacher kort så vi prøver igen)
 *   - Batch: lookupMany(ips) kører max 30 concurrent dns.reverse-calls
 *   - Skip: loopback/RFC1918/Tailscale CGNAT/multicast — disse har sjældent
 *     meningsfuld reverse-DNS og koster bare tid
 *   - Timeout: 800ms pr. lookup; sluk ikke tråden hvis DNS hænger
 */

import { promises as dns } from "node:dns";

interface CacheEntry {
  hostname: string | null;
  expiresAt: number;
}

const TTL_HIT_MS = 60 * 60 * 1000; // 1h
const TTL_MISS_MS = 5 * 60 * 1000; // 5min
const LOOKUP_TIMEOUT_MS = 800;
const MAX_CONCURRENT = 30;

const STATE_KEY = "__skynet_revdns_state__";

interface State {
  cache: Map<string, CacheEntry>;
  lookups: number;
  hits: number;
  misses: number;
  inflight: Map<string, Promise<string | null>>;
}

function getState(): State {
  const g = globalThis as unknown as Record<string, State>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = { cache: new Map(), lookups: 0, hits: 0, misses: 0, inflight: new Map() };
  }
  return g[STATE_KEY];
}

/** Returner true hvis IP'en sjældent har meningsfuld reverse-DNS. */
export function shouldSkip(ip: string): boolean {
  if (!ip) return true;
  // IPv4
  if (/^127\./.test(ip)) return true; // loopback
  if (/^10\./.test(ip)) return true; // RFC1918
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true; // link-local
  if (/^22[4-9]|^23[0-9]\./.test(ip)) return true; // multicast 224-239
  if (/^0\.0\.0\.0/.test(ip)) return true;
  // Tailscale CGNAT — vi har dedikeret VPN-detection, behøver ikke rhost
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  // IPv6
  if (ip === "::1" || ip === "::") return true;
  if (/^fe80::/i.test(ip)) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true; // ULA + Tailscale IPv6
  if (/^ff[0-9a-f]{2}:/i.test(ip)) return true; // multicast
  return false;
}

async function lookupOne(ip: string): Promise<string | null> {
  const state = getState();
  state.lookups++;

  // Inflight dedupe — multiple collectors kalder samme IP samtidigt
  const existing = state.inflight.get(ip);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const result = await Promise.race([
        dns.reverse(ip),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("dns timeout")), LOOKUP_TIMEOUT_MS)
        ),
      ]);
      const hostname = Array.isArray(result) && result.length > 0 ? result[0] : null;
      state.cache.set(ip, { hostname, expiresAt: Date.now() + (hostname ? TTL_HIT_MS : TTL_MISS_MS) });
      if (hostname) state.hits++;
      else state.misses++;
      return hostname;
    } catch {
      // NXDOMAIN, NODATA, network err, timeout — alle resulterer i miss
      state.misses++;
      state.cache.set(ip, { hostname: null, expiresAt: Date.now() + TTL_MISS_MS });
      return null;
    } finally {
      state.inflight.delete(ip);
    }
  })();

  state.inflight.set(ip, promise);
  return promise;
}

/** Hurtig cache-lookup uden at kalde DNS — bruges synkront fra hot paths. */
export function getCached(ip: string): string | null | undefined {
  if (shouldSkip(ip)) return null;
  const entry = getState().cache.get(ip);
  if (!entry) return undefined; // miss — caller kan trigger lookup
  if (entry.expiresAt < Date.now()) return undefined;
  return entry.hostname;
}

/**
 * Slå op for én IP. Returnerer hostname eller null hvis ikke fundet/skip.
 * Først cache-hit, dernæst dns.reverse() med timeout.
 */
export async function reverseLookup(ip: string): Promise<string | null> {
  if (shouldSkip(ip)) return null;

  const state = getState();
  const cached = state.cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    state.hits++;
    return cached.hostname;
  }

  return lookupOne(ip);
}

/**
 * Slå op for mange IP'er parallelt med concurrency limit. Returnerer
 * Map<ip, hostname|null>. Brug fra collector-tick efter at have samlet
 * unikke IP'er.
 */
export async function reverseLookupMany(ips: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const queue: string[] = [];

  // Først: cache-hits
  const state = getState();
  for (const ip of ips) {
    if (shouldSkip(ip)) {
      result.set(ip, null);
      continue;
    }
    const cached = state.cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      result.set(ip, cached.hostname);
      state.hits++;
    } else {
      queue.push(ip);
    }
  }

  // Derefter: parallel dns.reverse() i batches af MAX_CONCURRENT
  for (let i = 0; i < queue.length; i += MAX_CONCURRENT) {
    const batch = queue.slice(i, i + MAX_CONCURRENT);
    await Promise.all(
      batch.map(async (ip) => {
        const hostname = await lookupOne(ip);
        result.set(ip, hostname);
      })
    );
  }

  return result;
}

export function getStatus() {
  const state = getState();
  // Tæl entries der ikke er udløbet
  let valid = 0;
  let stale = 0;
  const now = Date.now();
  for (const v of state.cache.values()) {
    if (v.expiresAt > now) valid++;
    else stale++;
  }
  return {
    cacheSize: state.cache.size,
    validEntries: valid,
    staleEntries: stale,
    lookups: state.lookups,
    hits: state.hits,
    misses: state.misses,
    hitRate: state.lookups > 0 ? state.hits / state.lookups : 0,
    inflight: state.inflight.size,
  };
}

/** Periodic-cleanup — kald fx hvert kvarter. */
export function pruneCache(): number {
  const state = getState();
  const now = Date.now();
  let removed = 0;
  for (const [ip, entry] of state.cache) {
    if (entry.expiresAt < now) {
      state.cache.delete(ip);
      removed++;
    }
  }
  return removed;
}
