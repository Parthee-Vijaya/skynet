import { getGeo, getGeoMany, putGeo, type NetGeoRow } from "./store";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dage
const TTL_NEGATIVE_MS = 24 * 60 * 60 * 1000; // negative caches kortere
const RATE_LIMIT_PER_MINUTE = 40;          // ip-api free tier er 45/min — buffer for safety

// ── Token bucket ─────────────────────────────────────────────────────────────

let tokens = RATE_LIMIT_PER_MINUTE;
let lastRefill = Date.now();
const REFILL_RATE = RATE_LIMIT_PER_MINUTE / 60_000; // tokens pr. ms

function refill(): void {
  const now = Date.now();
  const dt = now - lastRefill;
  if (dt > 0) {
    tokens = Math.min(RATE_LIMIT_PER_MINUTE, tokens + dt * REFILL_RATE);
    lastRefill = now;
  }
}

function tryConsume(): boolean {
  refill();
  if (tokens >= 1) {
    tokens -= 1;
    return true;
  }
  return false;
}

// ── IP filter ────────────────────────────────────────────────────────────────

function isPrivateIP(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip.startsWith("::ffff:127.") || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true; // link-local
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  // 172.16.0.0/12
  if (ip.startsWith("172.")) {
    const second = Number(ip.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

interface IpApiResponse {
  status: string;
  message?: string;
  query?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  lat?: number;
  lon?: number;
  isp?: string;
  org?: string;
  as?: string;     // "AS15169 Google LLC"
}

async function fetchIpApi(ip: string, timeoutMs = 4000): Promise<NetGeoRow | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,regionName,city,lat,lon,isp,org,as,query`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as IpApiResponse;
    if (data.status !== "success") return null;

    let asn: string | null = null;
    let asnOrg: string | null = null;
    if (data.as) {
      const m = data.as.match(/^(AS\d+)\s*(.*)$/);
      if (m) {
        asn = m[1];
        asnOrg = m[2] || null;
      } else {
        asnOrg = data.as;
      }
    }

    return {
      ip,
      country: data.country ?? null,
      country_code: data.countryCode ?? null,
      region: data.regionName ?? null,
      city: data.city ?? null,
      lat: typeof data.lat === "number" ? data.lat : null,
      lng: typeof data.lon === "number" ? data.lon : null,
      isp: data.isp ?? null,
      asn,
      asn_org: asnOrg,
      cached_at: Date.now(),
      expires_at: Date.now() + TTL_MS,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Look up geo info for one IP — uses cache, then ip-api.com if rate-limit allows. */
export async function lookupIp(ip: string): Promise<NetGeoRow | null> {
  if (!ip || isPrivateIP(ip)) return null;
  const cached = getGeo(ip);
  if (cached) return cached;
  if (!tryConsume()) return null; // rate-limited; will retry next tick
  const fresh = await fetchIpApi(ip);
  if (fresh) {
    putGeo(fresh);
    return fresh;
  }
  // Negative cache so we don't hammer for the same bad IP
  const neg: NetGeoRow = {
    ip,
    country: null,
    country_code: null,
    region: null,
    city: null,
    lat: null,
    lng: null,
    isp: null,
    asn: null,
    asn_org: null,
    cached_at: Date.now(),
    expires_at: Date.now() + TTL_NEGATIVE_MS,
  };
  putGeo(neg);
  return null;
}

/** Look up many IPs — uses bulk-cache fetch + spreads new lookups across ticks. */
export async function lookupMany(ips: string[]): Promise<Map<string, NetGeoRow>> {
  const unique = Array.from(new Set(ips.filter((ip) => ip && !isPrivateIP(ip))));
  const cached = getGeoMany(unique);
  const missing = unique.filter((ip) => !cached.has(ip));

  // Best-effort: spawn lookups in parallel up to current token count.
  const results: Array<NetGeoRow | null> = [];
  for (const ip of missing) {
    results.push(await lookupIp(ip));
  }
  for (const r of results) {
    if (r) cached.set(r.ip, r);
  }
  return cached;
}

/** Background-enqueue — fire and forget; new lookups happen on next tick window. */
export function enqueueLookups(ips: string[]): void {
  void lookupMany(ips).catch(() => {});
}
