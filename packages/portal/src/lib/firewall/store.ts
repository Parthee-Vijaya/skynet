import { getDb } from "@/lib/db";

export interface NetConnRow {
  id: number;
  ts: number;
  pid: number | null;
  process: string;
  bundle_id: string | null;
  exec_path: string | null;
  proto: string;
  laddr: string | null;
  lport: number | null;
  raddr: string | null;
  rport: number | null;
  rhost: string | null;
  state: string | null;
  bytes_in: number;
  bytes_out: number;
  is_new: number;
}

export interface NetEventRow {
  id: number;
  ts: number;
  kind: string;
  process: string | null;
  bundle_id: string | null;
  raddr: string | null;
  rhost: string | null;
  detail: string | null;
  llm_explanation: string | null;
  acknowledged: number;
}

export interface NetGeoRow {
  ip: string;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  isp: string | null;
  asn: string | null;
  asn_org: string | null;
  cached_at: number;
  expires_at: number;
}

// ── Connections ─────────────────────────────────────────────────────────────

export interface ConnectionInsert {
  ts: number;
  pid: number | null;
  process: string;
  bundle_id?: string | null;
  exec_path?: string | null;
  proto: string;
  laddr?: string | null;
  lport?: number | null;
  raddr?: string | null;
  rport?: number | null;
  rhost?: string | null;
  state?: string | null;
  bytes_in?: number;
  bytes_out?: number;
  is_new: boolean;
}

export function insertConnections(rows: ConnectionInsert[]): void {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO network_connections
      (ts, pid, process, bundle_id, exec_path, proto, laddr, lport, raddr, rport, rhost, state, bytes_in, bytes_out, is_new)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((items: ConnectionInsert[]) => {
    for (const r of items) {
      stmt.run(
        r.ts,
        r.pid ?? null,
        r.process,
        r.bundle_id ?? null,
        r.exec_path ?? null,
        r.proto,
        r.laddr ?? null,
        r.lport ?? null,
        r.raddr ?? null,
        r.rport ?? null,
        r.rhost ?? null,
        r.state ?? null,
        r.bytes_in ?? 0,
        r.bytes_out ?? 0,
        r.is_new ? 1 : 0
      );
    }
  });
  tx(rows);
}

export interface ListConnectionsOpts {
  sinceMs?: number;
  process?: string;
  countryCode?: string;
  limit?: number;
  /** Only the most-recent observation per (pid, raddr, rport, proto). */
  dedup?: boolean;
}

export function listConnections(opts: ListConnectionsOpts = {}): NetConnRow[] {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 2000);
  const since = opts.sinceMs ?? Date.now() - 60_000;

  if (opts.dedup) {
    // Group by (pid, raddr, rport, proto), take row with max(ts).
    let sql = `
      SELECT c.* FROM network_connections c
      JOIN (
        SELECT pid, raddr, rport, proto, MAX(ts) AS max_ts
        FROM network_connections
        WHERE ts >= ?
        ${opts.process ? "AND process LIKE ?" : ""}
        GROUP BY pid, raddr, rport, proto
      ) latest
        ON c.pid IS latest.pid
       AND c.raddr IS latest.raddr
       AND c.rport IS latest.rport
       AND c.proto = latest.proto
       AND c.ts = latest.max_ts
      ORDER BY c.ts DESC
      LIMIT ?
    `;
    const params: (string | number)[] = [since];
    if (opts.process) params.push(`%${opts.process}%`);
    params.push(limit);
    return db.prepare(sql).all(...params) as NetConnRow[];
  }

  const where: string[] = ["ts >= ?"];
  const params: (string | number)[] = [since];
  if (opts.process) {
    where.push("process LIKE ?");
    params.push(`%${opts.process}%`);
  }
  params.push(limit);
  const sql = `
    SELECT * FROM network_connections
    WHERE ${where.join(" AND ")}
    ORDER BY ts DESC
    LIMIT ?
  `;
  return db.prepare(sql).all(...params) as NetConnRow[];
}

export interface TopTalker {
  process: string;
  bytes_in: number;
  bytes_out: number;
  conn_count: number;
}

export function topTalkers(windowMs = 60_000, limit = 10): TopTalker[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT process,
             SUM(bytes_in)  AS bytes_in,
             SUM(bytes_out) AS bytes_out,
             COUNT(*)       AS conn_count
      FROM network_connections
      WHERE ts >= ?
      GROUP BY process
      ORDER BY (bytes_in + bytes_out) DESC, conn_count DESC
      LIMIT ?
      `
    )
    .all(Date.now() - windowMs, limit) as TopTalker[];
}

export function activeFlowCount(windowMs = 30_000): number {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT COUNT(DISTINCT pid || ':' || COALESCE(raddr,'') || ':' || COALESCE(rport,'') || ':' || proto) AS n
      FROM network_connections
      WHERE ts >= ? AND state IS NOT 'LISTEN'
      `
    )
    .get(Date.now() - windowMs) as { n: number };
  return row?.n ?? 0;
}

export interface HistoryBucket {
  bucket: number;        // ms-epoch (start of 5-min window)
  bytes_in: number;
  bytes_out: number;
  conn_count: number;
}

/** 5-minute buckets over the last `windowMs` (default 24h). */
export function trafficHistory(windowMs = 24 * 60 * 60 * 1000, bucketMs = 5 * 60 * 1000): HistoryBucket[] {
  const db = getDb();
  const since = Date.now() - windowMs;
  return db
    .prepare(
      `
      SELECT (ts / ?) * ? AS bucket,
             SUM(bytes_in)  AS bytes_in,
             SUM(bytes_out) AS bytes_out,
             COUNT(*)       AS conn_count
      FROM network_connections
      WHERE ts >= ?
      GROUP BY bucket
      ORDER BY bucket ASC
      `
    )
    .all(bucketMs, bucketMs, since) as HistoryBucket[];
}

// ── Events ──────────────────────────────────────────────────────────────────

export interface EventInsert {
  ts?: number;
  kind: string;
  process?: string | null;
  bundle_id?: string | null;
  raddr?: string | null;
  rhost?: string | null;
  detail?: unknown;       // serialized to JSON
  llm_explanation?: string | null;
}

export function insertEvent(e: EventInsert): number {
  const db = getDb();
  const info = db
    .prepare(
      `
      INSERT INTO network_events (ts, kind, process, bundle_id, raddr, rhost, detail, llm_explanation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      e.ts ?? Date.now(),
      e.kind,
      e.process ?? null,
      e.bundle_id ?? null,
      e.raddr ?? null,
      e.rhost ?? null,
      e.detail !== undefined ? JSON.stringify(e.detail) : null,
      e.llm_explanation ?? null
    );
  return info.lastInsertRowid as number;
}

export interface ListEventsOpts {
  sinceMs?: number;
  kind?: string;
  limit?: number;
  unackedOnly?: boolean;
}

export function listEvents(opts: ListEventsOpts = {}): NetEventRow[] {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const since = opts.sinceMs ?? Date.now() - 24 * 60 * 60 * 1000;
  const where: string[] = ["ts >= ?"];
  const params: (string | number)[] = [since];
  if (opts.kind) {
    where.push("kind = ?");
    params.push(opts.kind);
  }
  if (opts.unackedOnly) where.push("acknowledged = 0");
  params.push(limit);
  return db
    .prepare(`SELECT * FROM network_events WHERE ${where.join(" AND ")} ORDER BY ts DESC LIMIT ?`)
    .all(...params) as NetEventRow[];
}

export function ackEvent(id: number): void {
  getDb().prepare("UPDATE network_events SET acknowledged = 1 WHERE id = ?").run(id);
}

// ── Geo cache ────────────────────────────────────────────────────────────────

export function getGeo(ip: string): NetGeoRow | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM network_geo_cache WHERE ip = ? AND expires_at > ?")
    .get(ip, Date.now()) as NetGeoRow | undefined;
  return row;
}

export function getGeoMany(ips: string[]): Map<string, NetGeoRow> {
  const out = new Map<string, NetGeoRow>();
  if (ips.length === 0) return out;
  const db = getDb();
  const placeholders = ips.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM network_geo_cache WHERE ip IN (${placeholders}) AND expires_at > ?`
    )
    .all(...ips, Date.now()) as NetGeoRow[];
  for (const r of rows) out.set(r.ip, r);
  return out;
}

export function putGeo(row: Omit<NetGeoRow, "cached_at">): void {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO network_geo_cache (ip, country, country_code, region, city, lat, lng, isp, asn, asn_org, cached_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ip) DO UPDATE SET
      country = excluded.country,
      country_code = excluded.country_code,
      region = excluded.region,
      city = excluded.city,
      lat = excluded.lat,
      lng = excluded.lng,
      isp = excluded.isp,
      asn = excluded.asn,
      asn_org = excluded.asn_org,
      cached_at = excluded.cached_at,
      expires_at = excluded.expires_at
    `
  ).run(
    row.ip,
    row.country,
    row.country_code,
    row.region,
    row.city,
    row.lat,
    row.lng,
    row.isp,
    row.asn,
    row.asn_org,
    Date.now(),
    row.expires_at
  );
}

// ── Retention ────────────────────────────────────────────────────────────────

const CONN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function pruneNetwork(): void {
  const db = getDb();
  const now = Date.now();
  db.prepare("DELETE FROM network_connections WHERE ts < ?").run(now - CONN_RETENTION_MS);
  db.prepare("DELETE FROM network_events WHERE ts < ?").run(now - EVENT_RETENTION_MS);
  db.prepare("DELETE FROM network_geo_cache WHERE expires_at < ?").run(now);
}
