/**
 * Aggregator for /api/firewall/inspect — samler alle signaler om en forbindelse:
 *   - Geo (cached i network_geo_cache)
 *   - DDG Tracker Radar lookup
 *   - VPN/mesh-detection (Tailscale/Proton/Mullvad/...)
 *   - Port-classification (well-known services)
 *   - Cached LLM-explanation (24h)
 *   - Recent traffic stats for samme (process, host)-par
 *   - Risk-score 0-100
 *   - Anbefalede actions
 */

import { getDb } from "@/lib/db";
import { getGeoMany } from "./store";
import { ensureLoaded as ensureTdsLoaded, lookupHost, getTdsStatus } from "./tracker-db";
import { detectVpn, classifyPort, type VpnDetection } from "./vpn-detect";
import { explainConnection, type ExplanationResult } from "./explain";

export interface InspectQuery {
  raddr?: string | null;
  rhost?: string | null;
  laddr?: string | null;
  rport?: number | null;
  proto?: string;
  process?: string;
  bundle_id?: string | null;
  pid?: number | null;
  /** Hvis true: kør LLM-explain (kan tage 5-30s første gang). */
  runLLM?: boolean;
}

export interface InspectResult {
  query: InspectQuery;
  geo: {
    country: string | null;
    country_code: string | null;
    region: string | null;
    city: string | null;
    isp: string | null;
    asn: string | null;
    asn_org: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  tracker: {
    isTracker: boolean;
    isKnown: boolean;
    domain?: string;
    owner?: string;
    ownerDisplay?: string;
    categories?: string[];
    prevalence?: number;
    fingerprinting?: number;
    defaultAction?: "block" | "ignore";
    classification: string;
  };
  vpn: VpnDetection;
  port: {
    number: number | null;
    service: string | null;
    secure: boolean | null;
  };
  recent: {
    flow_count_24h: number;
    bytes_24h: number;
    first_seen: number | null;
    last_seen: number | null;
    other_processes: string[];
  };
  llm: ExplanationResult | null;
  risk: {
    score: number;
    factors: Array<{ factor: string; weight: number; reason: string }>;
    band: "low" | "medium" | "high";
  };
  recommendations: Array<{
    action: "block_app" | "block_host" | "kill_process" | "monitor" | "investigate";
    label: string;
    reason: string;
    destructive: boolean;
  }>;
}

const HIGH_RISK_COUNTRIES = new Set(["RU", "CN", "KP", "IR", "BY"]);
const KNOWN_LEGIT_OWNERS = ["Apple", "Microsoft", "Cloudflare", "Akamai", "Tailscale", "Proton AG", "Mullvad"];

export async function inspectConnection(q: InspectQuery): Promise<InspectResult> {
  // Ensure TDS er loaded (best-effort — graceful hvis offline)
  await ensureTdsLoaded().catch(() => undefined);

  // 1) Geo lookup
  const ipKey = q.raddr ?? "";
  const geoMap = ipKey ? getGeoMany([ipKey]) : new Map();
  const geoRow = ipKey ? geoMap.get(ipKey) : null;
  const geo = geoRow
    ? {
        country: geoRow.country,
        country_code: geoRow.country_code,
        region: geoRow.region,
        city: geoRow.city,
        isp: geoRow.isp,
        asn: geoRow.asn,
        asn_org: geoRow.asn_org,
        lat: geoRow.lat,
        lng: geoRow.lng,
      }
    : null;

  // 2) Tracker lookup
  const trackerRaw = q.rhost
    ? lookupHost(q.rhost)
    : { isTracker: false, isKnown: false, classification: "unknown" as const };
  const tracker = {
    isTracker: trackerRaw.isTracker,
    isKnown: trackerRaw.isKnown,
    domain: trackerRaw.domain,
    owner: trackerRaw.owner,
    ownerDisplay: trackerRaw.ownerDisplay,
    categories: trackerRaw.categories,
    prevalence: trackerRaw.prevalence,
    fingerprinting: trackerRaw.fingerprinting,
    defaultAction: trackerRaw.defaultAction,
    classification: trackerRaw.classification,
  };

  // 3) VPN detection
  const vpn = detectVpn({
    raddr: q.raddr ?? null,
    rhost: q.rhost ?? null,
    laddr: q.laddr ?? null,
    asnOrg: geo?.asn_org ?? null,
  });

  // 4) Port classification
  const portInfo = classifyPort(q.rport ?? null, q.proto ?? "tcp4");
  const port = {
    number: q.rport ?? null,
    service: portInfo.service,
    secure: portInfo.secure,
  };

  // 5) Recent traffic for (process, raddr)
  const recent = computeRecent(q.process ?? null, q.raddr ?? null);

  // 6) LLM (kun hvis explicit requested)
  let llm: ExplanationResult | null = null;
  if (q.runLLM && q.rhost) {
    try {
      llm = await explainConnection(q.rhost, q.process ?? null);
    } catch (e) {
      console.warn("[inspect] LLM explain failed:", e instanceof Error ? e.message : e);
    }
  }

  // 7) Risk-score
  const risk = computeRisk({ tracker, vpn, geo, port, llm, recent });

  // 8) Recommendations
  const recommendations = buildRecommendations({ tracker, vpn, geo, risk, q });

  return { query: q, geo, tracker, vpn, port, recent, llm, risk, recommendations };
}

// ── Recent ───────────────────────────────────────────────────────────────────

function computeRecent(process: string | null, raddr: string | null): InspectResult["recent"] {
  if (!process || !raddr) {
    return { flow_count_24h: 0, bytes_24h: 0, first_seen: null, last_seen: null, other_processes: [] };
  }
  const since = Date.now() - 24 * 3_600_000;
  const db = getDb();

  const stats = db
    .prepare(
      `SELECT COUNT(*) cnt, SUM(bytes_in + bytes_out) bytes, MIN(ts) first, MAX(ts) last
       FROM network_connections WHERE process = ? AND raddr = ? AND ts >= ?`
    )
    .get(process, raddr, since) as { cnt: number; bytes: number | null; first: number | null; last: number | null };

  const otherProcs = db
    .prepare(
      `SELECT DISTINCT process FROM network_connections
       WHERE raddr = ? AND ts >= ? AND process != ? LIMIT 8`
    )
    .all(raddr, since, process) as Array<{ process: string }>;

  return {
    flow_count_24h: stats.cnt ?? 0,
    bytes_24h: stats.bytes ?? 0,
    first_seen: stats.first,
    last_seen: stats.last,
    other_processes: otherProcs.map((r) => r.process),
  };
}

// ── Risk ─────────────────────────────────────────────────────────────────────

interface RiskInput {
  tracker: InspectResult["tracker"];
  vpn: VpnDetection;
  geo: InspectResult["geo"];
  port: InspectResult["port"];
  llm: ExplanationResult | null;
  recent: InspectResult["recent"];
}

function computeRisk(r: RiskInput): InspectResult["risk"] {
  const factors: Array<{ factor: string; weight: number; reason: string }> = [];
  let score = 0;

  // Tracker classification — strongest signal
  if (r.tracker.classification === "tracker" && r.tracker.defaultAction === "block") {
    const w = 35 + Math.round((r.tracker.prevalence ?? 0) * 15);
    score += w;
    factors.push({
      factor: "kendt-tracker",
      weight: w,
      reason: `DDG Tracker Radar: ${r.tracker.ownerDisplay ?? "?"} · kategori ${r.tracker.categories?.join(", ") ?? "?"} · prevalence ${(r.tracker.prevalence ?? 0).toFixed(2)}`,
    });
  } else if (r.tracker.classification === "tracker") {
    score += 20;
    factors.push({
      factor: "tracker-relateret",
      weight: 20,
      reason: `Klassificeret som tracker, men default-action = ${r.tracker.defaultAction ?? "ignore"}`,
    });
  }

  if (r.tracker.fingerprinting && r.tracker.fingerprinting >= 2) {
    score += 10;
    factors.push({
      factor: "aggressiv-fingerprinting",
      weight: 10,
      reason: `fingerprinting-score ${r.tracker.fingerprinting}/3`,
    });
  }

  // High-risk country
  if (r.geo?.country_code && HIGH_RISK_COUNTRIES.has(r.geo.country_code)) {
    score += 25;
    factors.push({
      factor: "high-risk-country",
      weight: 25,
      reason: `Forbindelse til ${r.geo.country} (${r.geo.country_code})`,
    });
  }

  // Insecure port
  if (r.port.service && r.port.secure === false && !["DNS"].includes(r.port.service)) {
    score += 8;
    factors.push({ factor: "ukrypteret", weight: 8, reason: `${r.port.service} er ukrypteret` });
  }

  // LLM trust score (lower = riskier) — converts 0..10 til 0..30
  if (r.llm) {
    const llmRisk = (10 - r.llm.trust_score) * 3;
    if (llmRisk > 0) {
      score += llmRisk;
      factors.push({
        factor: "llm-bekymring",
        weight: llmRisk,
        reason: `LLM trust ${r.llm.trust_score}/10 — ${r.llm.summary.slice(0, 80)}`,
      });
    }
  }

  // First-seen recently (new app behavior)
  if (r.recent.first_seen && r.recent.first_seen > Date.now() - 5 * 60_000) {
    score += 5;
    factors.push({ factor: "nyligt-set", weight: 5, reason: "Forbindelse første gang set inden for 5 min" });
  }

  // Mitigations — REDUCE score
  if (r.vpn.isVpn) {
    score -= r.vpn.trustBoost * 5;
    factors.push({
      factor: "via-vpn",
      weight: -r.vpn.trustBoost * 5,
      reason: `Sendes via ${r.vpn.provider} — krypteret tunnel`,
    });
  }

  if (r.geo?.asn_org && KNOWN_LEGIT_OWNERS.some((o) => r.geo!.asn_org!.includes(o))) {
    score -= 10;
    factors.push({ factor: "kendt-legit-asn", weight: -10, reason: `ASN: ${r.geo.asn_org}` });
  }

  if (
    r.recent.flow_count_24h > 20 &&
    r.recent.first_seen &&
    r.recent.first_seen < Date.now() - 24 * 3_600_000
  ) {
    score -= 5;
    factors.push({
      factor: "etableret-mønster",
      weight: -5,
      reason: `${r.recent.flow_count_24h} flows over >24h — kendt mønster`,
    });
  }

  score = Math.max(0, Math.min(100, score));
  const band: "low" | "medium" | "high" = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { score, factors, band };
}

// ── Recommendations ──────────────────────────────────────────────────────────

interface RecInput {
  tracker: InspectResult["tracker"];
  vpn: VpnDetection;
  geo: InspectResult["geo"];
  risk: InspectResult["risk"];
  q: InspectQuery;
}

function buildRecommendations(r: RecInput): InspectResult["recommendations"] {
  const recs: InspectResult["recommendations"] = [];

  if (r.risk.band === "high" && r.q.bundle_id) {
    recs.push({
      action: "block_host",
      label: `Bloker ${r.q.rhost ?? r.q.raddr} for ${r.q.process ?? r.q.bundle_id}`,
      reason: `Risk-score ${r.risk.score}/100 (high). Begrænset blok lader appen virke for andre hosts.`,
      destructive: true,
    });
  }

  if (r.tracker.isTracker && r.tracker.defaultAction === "block" && r.q.bundle_id) {
    recs.push({
      action: "block_host",
      label: `Bloker ${r.tracker.domain ?? r.q.rhost} (kendt ${r.tracker.categories?.[0] ?? "tracker"})`,
      reason: `DDG default = block. Owner: ${r.tracker.ownerDisplay ?? r.tracker.owner ?? "?"}.`,
      destructive: true,
    });
  }

  if (r.q.pid) {
    recs.push({
      action: "kill_process",
      label: `Afslut process ${r.q.process ?? `pid ${r.q.pid}`}`,
      reason: "SIGTERM appen. Den vil typisk genstarte ved næste use; brug kun hvis nødvendigt.",
      destructive: true,
    });
  }

  if (r.risk.band === "low") {
    recs.push({
      action: "monitor",
      label: "Bare overvåg — ser fint ud",
      reason: r.vpn.isVpn ? `Via ${r.vpn.provider}, lav risk-score.` : "Lav risk-score, kendt mønster.",
      destructive: false,
    });
  }

  if (r.risk.band === "medium" && !r.tracker.isKnown) {
    recs.push({
      action: "investigate",
      label: "Undersøg via LLM-explain",
      reason: "Ukendt host i Tracker Radar. Kør LLM-forklaring for kontekst.",
      destructive: false,
    });
  }

  return recs;
}

export function getInspectorHealth() {
  return { tracker_db: getTdsStatus() };
}
