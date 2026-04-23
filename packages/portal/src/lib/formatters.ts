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
