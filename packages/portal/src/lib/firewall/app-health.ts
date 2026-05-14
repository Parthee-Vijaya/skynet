/**
 * Per-app telemetry-budget / health-score.
 *
 * Beregner over et tidsvindue (default 7 dage):
 *   - Total flows
 *   - Tracker-flows (DDG TDS)
 *   - Blocklist-matches (OISD/StevenBlack/EasyPrivacy)
 *   - Unique remote hosts
 *   - Unique trackers
 *   - High-risk events (network_events.kind='suspicious' + risk≥70)
 *
 * Grades (samlet score 0-100, A-F):
 *   A: tracker-ratio < 1%
 *   B: < 5%
 *   C: < 15%
 *   D: < 30%
 *   F: ≥ 30%
 */

import { getDb } from "@/lib/db";
import { lookupHost, ensureLoaded as ensureTdsLoaded } from "./tracker-db";
import { lookup as lookupBlocklist, ensureLoaded as ensureBlocklistsLoaded } from "./blocklists";

export interface AppHealth {
  process: string;
  bundle_id: string | null;
  exec_path: string | null;
  total_flows: number;
  unique_hosts: number;
  tracker_flows: number;
  unique_trackers: number;
  blocklist_flows: number;
  high_risk_events: number;
  total_bytes: number;
  tracker_ratio: number;     // 0..1
  grade: "A" | "B" | "C" | "D" | "F";
  /** 0-100 — højere er bedre (omvendt af risk-score). */
  score: number;
  top_trackers: Array<{ host: string; flow_count: number; owner?: string }>;
  blocklist_examples: Array<{ host: string; flow_count: number }>;
}

export async function computeAppHealth(hours = 7 * 24): Promise<AppHealth[]> {
  await Promise.all([
    ensureTdsLoaded().catch(() => undefined),
    ensureBlocklistsLoaded().catch(() => undefined),
  ]);

  const since = Date.now() - hours * 3_600_000;
  const db = getDb();

  // Pull alle distinct (process, raddr, rhost) for tidsvinduet med flow counts
  // Vi er bevidste om at JOIN'e med events til high-risk count
  const rows = db
    .prepare(
      `SELECT
        process,
        bundle_id,
        exec_path,
        COUNT(*) AS flow_count,
        SUM(bytes_in + bytes_out) AS bytes,
        COUNT(DISTINCT raddr) AS unique_raddr
       FROM network_connections
       WHERE ts >= ? AND raddr IS NOT NULL
       GROUP BY process
       HAVING COUNT(*) >= 3
       ORDER BY flow_count DESC
       LIMIT 100`
    )
    .all(since) as Array<{
      process: string;
      bundle_id: string | null;
      exec_path: string | null;
      flow_count: number;
      bytes: number | null;
      unique_raddr: number;
    }>;

  const results: AppHealth[] = [];

  for (const r of rows) {
    // Per-app: hvilke hosts har den talt med, og hvor mange er trackers/blocklisted?
    const hosts = db
      .prepare(
        `SELECT raddr, rhost, COUNT(*) cnt, SUM(bytes_in + bytes_out) bytes
         FROM network_connections
         WHERE process = ? AND ts >= ? AND raddr IS NOT NULL
         GROUP BY raddr ORDER BY cnt DESC LIMIT 200`
      )
      .all(r.process, since) as Array<{ raddr: string; rhost: string | null; cnt: number; bytes: number | null }>;

    let tracker_flows = 0;
    let blocklist_flows = 0;
    const trackerMap = new Map<string, { flow_count: number; owner?: string }>();
    const blocklistList: Array<{ host: string; flow_count: number }> = [];

    for (const h of hosts) {
      if (!h.rhost) continue;
      const tds = lookupHost(h.rhost);
      const bl = lookupBlocklist(h.rhost);
      if (tds.isTracker) {
        tracker_flows += h.cnt;
        const key = tds.domain ?? h.rhost;
        const existing = trackerMap.get(key);
        if (existing) existing.flow_count += h.cnt;
        else trackerMap.set(key, { flow_count: h.cnt, owner: tds.ownerDisplay ?? tds.owner });
      }
      if (bl.blocked) {
        blocklist_flows += h.cnt;
        blocklistList.push({ host: h.rhost, flow_count: h.cnt });
      }
    }

    const high_risk_events = (db
      .prepare(
        `SELECT COUNT(*) cnt FROM network_events
         WHERE process = ? AND ts >= ? AND kind IN ('suspicious', 'new_app')`
      )
      .get(r.process, since) as { cnt: number }).cnt;

    const tracker_ratio = r.flow_count > 0 ? tracker_flows / r.flow_count : 0;
    const grade = computeGrade(tracker_ratio);
    const score = Math.round((1 - tracker_ratio) * 100);

    const top_trackers = [...trackerMap.entries()]
      .sort((a, b) => b[1].flow_count - a[1].flow_count)
      .slice(0, 10)
      .map(([host, v]) => ({ host, flow_count: v.flow_count, owner: v.owner }));

    results.push({
      process: r.process,
      bundle_id: r.bundle_id,
      exec_path: r.exec_path,
      total_flows: r.flow_count,
      unique_hosts: r.unique_raddr,
      tracker_flows,
      unique_trackers: trackerMap.size,
      blocklist_flows,
      high_risk_events,
      total_bytes: r.bytes ?? 0,
      tracker_ratio,
      grade,
      score,
      top_trackers,
      blocklist_examples: blocklistList.slice(0, 8),
    });
  }

  // Sortér efter "værst først" (lavest score, mest sport-flows)
  results.sort((a, b) => {
    if (a.grade !== b.grade) return gradeRank(a.grade) - gradeRank(b.grade);
    return b.tracker_flows - a.tracker_flows;
  });

  return results;
}

function computeGrade(ratio: number): "A" | "B" | "C" | "D" | "F" {
  if (ratio < 0.01) return "A";
  if (ratio < 0.05) return "B";
  if (ratio < 0.15) return "C";
  if (ratio < 0.3) return "D";
  return "F";
}

function gradeRank(g: "A" | "B" | "C" | "D" | "F"): number {
  return { A: 4, B: 3, C: 2, D: 1, F: 0 }[g];
}
