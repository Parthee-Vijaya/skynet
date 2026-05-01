import type { AirQualityData } from "./types";

export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  if (code <= 99) return "⛈️";
  return "🌡️";
}

export function weatherLabel(code: number): string {
  if (code === 0) return "Klart";
  if (code <= 2) return "Delvist skyet";
  if (code === 3) return "Overskyet";
  if (code <= 48) return "Tåge";
  if (code <= 57) return "Støvregn";
  if (code <= 67) return "Regn";
  if (code <= 77) return "Sne";
  if (code <= 82) return "Regnbyger";
  if (code <= 86) return "Snebyger";
  return "Torden";
}

export function ratingLabel(r: AirQualityData["rating"]): string {
  return {
    good: "God",
    moderate: "Moderat",
    unhealthy: "Usund",
    very_unhealthy: "Meget usund",
    hazardous: "Farlig",
  }[r];
}

export function ratingColor(r: AirQualityData["rating"]): string {
  return {
    good: "text-emerald-400 bg-emerald-500/10",
    moderate: "text-amber-400 bg-amber-500/10",
    unhealthy: "text-orange-400 bg-orange-500/10",
    very_unhealthy: "text-rose-400 bg-rose-500/10",
    hazardous: "text-fuchsia-400 bg-fuchsia-500/10",
  }[r];
}

export function formatBytes(b: number): string {
  if (b === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatRate(b: number): string {
  if (b < 1024) return `${Math.round(b)} B/s`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB/s`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}t ${m}m`;
  if (h > 0) return `${h}t ${m}m`;
  return `${m}m`;
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "lige nu";
  if (m < 60) return `${m} min siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t siden`;
  const d = Math.floor(h / 24);
  return `${d}d siden`;
}

// ── Token / duration / truncate-helpers ──────────────────────────────────────
// Tidligere duplikeret i ClaudeWidget, claude-sessions, continue-page, agent-events.

/** Format token-count: "1.2 b" / "240.5 m" / "12.3 k" / "456" */
export function fmtTok(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + " b";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " m";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " k";
  return String(n);
}

/**
 * Relativ tid siden et ms-timestamp på dansk: "12s siden", "3m siden",
 * "5t siden", "2d siden", eller "lige nu" hvis < 1 minut.
 *
 * Bemærk: tager ms (Date.now-format), ikke ISO. Brug formatRelativeTime hvis
 * du har en ISO-streng.
 */
export function timeSince(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "lige nu";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "lige nu";
  if (mins < 60) return `${mins}m siden`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}t siden`;
  const days = Math.round(hours / 24);
  return `${days}d siden`;
}

/**
 * Format duration som ms til kort dansk streng:
 * "<1s" / "12s" / "5m" / "2t" / "2t 15m"
 */
export function fmtDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${hr}t ${m}m` : `${hr}t`;
}

/** Truncate streng til max-længde, append "…" hvis afkortet. */
export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
