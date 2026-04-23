import { getDb } from "./db";
import type { HistoryPoint } from "./types";

const RETENTION_MS = 60 * 60 * 1000;

export function writePoint(metric: string, value: number, ts: number = Date.now()): void {
  const db = getDb();
  db.prepare("INSERT INTO history (metric, value, ts) VALUES (?, ?, ?)").run(metric, value, ts);
}

export function writePoints(points: { metric: string; value: number }[], ts: number = Date.now()): void {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO history (metric, value, ts) VALUES (?, ?, ?)");
  const tx = db.transaction((rows: { metric: string; value: number }[]) => {
    for (const r of rows) stmt.run(r.metric, r.value, ts);
  });
  tx(points);
}

export function readSeries(metric: string, windowMs: number = RETENTION_MS): HistoryPoint[] {
  const db = getDb();
  const since = Date.now() - windowMs;
  const rows = db
    .prepare("SELECT ts, value FROM history WHERE metric = ? AND ts >= ? ORDER BY ts ASC")
    .all(metric, since) as HistoryPoint[];
  return rows;
}

export function pruneOld(): void {
  const db = getDb();
  const cutoff = Date.now() - RETENTION_MS;
  db.prepare("DELETE FROM history WHERE ts < ?").run(cutoff);
}
