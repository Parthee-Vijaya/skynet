/**
 * Helpers omkring cron-expressions: validering, human-readable beskrivelse,
 * og næste N udløb. Bruges af automation-editoren (live feedback) + listen
 * (vis "næste kørsel").
 */

import { CronExpressionParser } from "cron-parser";
import cronstrue from "cronstrue/i18n";

export interface CronInfo {
  valid: boolean;
  /** Human-readable på dansk, fx "Hver dag kl. 07:00" */
  description?: string;
  /** Næste N udløbstidspunkter som ms-since-epoch */
  nextRuns?: number[];
  error?: string;
}

/** Bredt accept: 5- og 6-felt-cron, * og standard-syntaks */
function isLikelyCron(expr: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return false;
  const fields = trimmed.split(/\s+/);
  return fields.length === 5 || fields.length === 6;
}

export function describeCron(expression: string, locale = "da"): string | null {
  try {
    return cronstrue.toString(expression, { locale, use24HourTimeFormat: true });
  } catch {
    return null;
  }
}

export function nextRuns(expression: string, count = 3, tz?: string): number[] {
  try {
    const it = CronExpressionParser.parse(expression, {
      currentDate: new Date(),
      tz: tz || undefined,
    });
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(it.next().getTime());
    }
    return out;
  } catch {
    return [];
  }
}

export function inspectCron(expression: string, tz?: string): CronInfo {
  if (!isLikelyCron(expression)) {
    return { valid: false, error: "Forkert antal felter (skal være 5)" };
  }
  const description = describeCron(expression);
  const runs = nextRuns(expression, 3, tz);
  if (!description || runs.length === 0) {
    return { valid: false, error: "Kunne ikke tolke expression" };
  }
  return { valid: true, description, nextRuns: runs };
}

/**
 * "Næste kørsel om 4t 22m" — kort relativ-tid på dansk.
 * Returns "—" hvis ts er ugyldig.
 */
export function relativeFromNow(ts: number): string {
  const diff = ts - Date.now();
  if (!Number.isFinite(diff)) return "—";
  if (diff < 0) {
    // I fortiden — vis som "for X siden"
    return `for ${shortDuration(-diff)} siden`;
  }
  if (diff < 60_000) return `om ${Math.max(1, Math.floor(diff / 1000))}s`;
  return `om ${shortDuration(diff)}`;
}

export function shortDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    const remMin = min % 60;
    return remMin > 0 ? `${hr}t ${remMin}m` : `${hr}t`;
  }
  const day = Math.floor(hr / 24);
  const remHr = hr % 24;
  return remHr > 0 ? `${day}d ${remHr}t` : `${day}d`;
}
