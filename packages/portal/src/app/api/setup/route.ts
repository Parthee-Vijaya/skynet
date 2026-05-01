/**
 * /api/setup — no auth required (initial setup on a fresh Mac).
 *
 * GET  → { detections, summary, profile: { name, location } }
 * POST → save profile (name + city → geocode → lat/lng) and return result
 */

import { NextRequest, NextResponse } from "next/server";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getSetting,
  getUserName,
  setUserName,
  getLocation,
  setSettingJSON,
  type LocationSetting,
} from "@/lib/settings";

export const dynamic = "force-dynamic";
const exec = promisify(execCb);

// ── Types ────────────────────────────────────────────────────────────────────

interface Detection {
  key: string;
  name: string;
  status: "ok" | "missing" | "partial";
  details?: string;
  hint?: string;
  feature: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ping(url: string, ms = 2500): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    return res.ok || res.status < 500;
  } catch { return false; }
}

async function fetchJson<T>(url: string, ms = 2500): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

async function hasFile(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function hasCommand(cmd: string): Promise<boolean> {
  try { await exec(`command -v ${cmd}`, { timeout: 1500 }); return true; } catch { return false; }
}

// ── Detections ────────────────────────────────────────────────────────────────

async function dInternet(): Promise<Detection> {
  const targets = ["https://api.github.com", "https://1.1.1.1", "https://api.open-meteo.com"];
  for (const t of targets) {
    if (await ping(t, 5000)) {
      return { key: "internet", name: "Internet", status: "ok", details: `Forbundet`, feature: "Alle cloud-widgets" };
    }
  }
  return { key: "internet", name: "Internet", status: "missing", details: "Ingen forbindelse", hint: "Tjek netværk.", feature: "Alle cloud-widgets" };
}

async function dLmStudio(): Promise<Detection> {
  const base = (getSetting("llm_base_url") || "http://localhost:1234/v1").replace(/\/$/, "");
  const data = await fetchJson<{ data: Array<{ id: string }> }>(`${base}/models`);
  if (data?.data?.length) {
    const names = data.data.slice(0, 3).map((m) => m.id.split("/").pop() ?? m.id).join(", ");
    return { key: "lm_studio", name: "LM Studio", status: "ok", details: `${data.data.length} model(ler): ${names}`, feature: "Chat · LLM-automationer" };
  }
  return {
    key: "lm_studio", name: "LM Studio", status: "missing",
    hint: "Installer LM Studio → load en model → Start Local Server (port 1234).",
    feature: "Chat · LLM-automationer",
  };
}

async function dGitHub(): Promise<Detection> {
  const ok = await ping("https://api.github.com/zen", 4000);
  return ok
    ? { key: "github", name: "GitHub API", status: "ok", details: "Tilgængelig (60 req/h anonym)", feature: "Trending repos · GitHub-widget" }
    : { key: "github", name: "GitHub API", status: "partial", details: "Timeout eller rate-limit", hint: "Prøv igen om lidt.", feature: "Trending repos · GitHub-widget" };
}

async function dPlex(): Promise<Detection> {
  const url = getSetting("plex_url") || "http://localhost:32400";
  const token = getSetting("plex_token");
  const up = await ping(`${url}/identity`, 2000);
  if (!up) return { key: "plex", name: "Plex Media Server", status: "missing", hint: `Plex svarer ikke på ${url}. Start Plex, eller sæt plex_url i settings.`, feature: "Plex-widget" };
  if (!token) return { key: "plex", name: "Plex Media Server", status: "partial", details: "Kører, men token mangler", hint: "Gem dit Plex-token under Settings.", feature: "Plex-widget" };
  return { key: "plex", name: "Plex Media Server", status: "ok", details: `Kører på ${url}`, feature: "Plex-widget" };
}

async function dTailscale(): Promise<Detection> {
  const paths = ["/Applications/Tailscale.app", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale"];
  for (const p of paths) if (await hasFile(p)) {
    return { key: "tailscale", name: "Tailscale", status: "ok", details: p, feature: "VPN · Services" };
  }
  return { key: "tailscale", name: "Tailscale", status: "missing", hint: "Installer fra tailscale.com/download/mac.", feature: "VPN · Services" };
}

async function dNtfy(): Promise<Detection> {
  const topic = getSetting("notify_config")
    ? (() => { try { return JSON.parse(getSetting("notify_config")!).ntfyTopic; } catch { return ""; } })()
    : "";
  if (topic) return { key: "ntfy", name: "ntfy push", status: "ok", details: `Topic: ${topic}`, feature: "Push-notifikationer" };
  return { key: "ntfy", name: "ntfy push", status: "partial", details: "Ikke konfigureret", hint: "Hent ntfy-appen og sæt dit topic under Settings → Notifikationer.", feature: "Push-notifikationer" };
}

async function dDaemon(): Promise<Detection> {
  const ok = await ping("http://localhost:6767", 2000);
  return ok
    ? { key: "daemon", name: "Skynet Daemon", status: "ok", details: "Kører på :6767", feature: "Agents · Automationer" }
    : { key: "daemon", name: "Skynet Daemon", status: "missing", details: "Ikke tilgængelig på :6767", hint: "Kontrollér at LaunchAgent com.skynet.daemon er installeret.", feature: "Agents · Automationer" };
}

async function dPaseo(): Promise<Detection> {
  const cliInstalled = await hasCommand("paseo");
  const daemonUp = await ping("http://localhost:6868", 2000);
  const plistExists = await hasFile(join(homedir(), "Library", "LaunchAgents", "com.paseo.daemon.plist"));

  if (!cliInstalled) {
    return {
      key: "paseo",
      name: "Paseo (agent orchestrator)",
      status: "missing",
      details: "Paseo CLI ikke installeret",
      hint: "Kør 'npm install -g @getpaseo/cli' eller kør install.sh igen.",
      feature: "/agents · Claude Code/Codex/OpenCode orkestrering",
    };
  }
  if (!daemonUp) {
    return {
      key: "paseo",
      name: "Paseo (agent orchestrator)",
      status: "partial",
      details: "CLI installeret, daemon kører ikke",
      hint: plistExists
        ? "Kør 'launchctl kickstart -k gui/$(id -u)/com.paseo.daemon' for at starte."
        : "LaunchAgent mangler — kør install.sh for at oprette den.",
      feature: "/agents · Claude Code/Codex/OpenCode orkestrering",
    };
  }
  return {
    key: "paseo",
    name: "Paseo (agent orchestrator)",
    status: "ok",
    details: `Kører på :6868 ${plistExists ? "· auto-start aktiv" : "· uden LaunchAgent"}`,
    feature: "/agents · Claude Code/Codex/OpenCode orkestrering",
  };
}

async function dLaunchAgents(): Promise<Detection> {
  const portal = join(homedir(), "Library", "LaunchAgents", "com.skynet.portal.plist");
  const daemon = join(homedir(), "Library", "LaunchAgents", "com.skynet.daemon.plist");
  const [hasPortal, hasDaemon] = await Promise.all([hasFile(portal), hasFile(daemon)]);
  if (hasPortal && hasDaemon) return { key: "autostart", name: "Autostart (LaunchAgents)", status: "ok", details: "com.skynet.portal + com.skynet.daemon", feature: "Starter ved login" };
  if (hasPortal || hasDaemon) return { key: "autostart", name: "Autostart (LaunchAgents)", status: "partial", details: `Portal: ${hasPortal ? "✓" : "✗"}  Daemon: ${hasDaemon ? "✓" : "✗"}`, feature: "Starter ved login" };
  return { key: "autostart", name: "Autostart (LaunchAgents)", status: "missing", hint: "Kør install.sh for at sætte autostart op.", feature: "Starter ved login" };
}

async function dNode(): Promise<Detection> {
  return { key: "node", name: "Node.js", status: "ok", details: process.version, feature: "Runtime" };
}

async function dNasaApod(): Promise<Detection> {
  const hasKey = !!process.env.NASA_API_KEY && process.env.NASA_API_KEY !== "DEMO_KEY";
  return {
    key: "nasa", name: "NASA APOD", status: hasKey ? "ok" : "partial",
    details: hasKey ? "API-nøgle konfigureret" : "Kører på DEMO_KEY (begrænset hastighed)",
    hint: hasKey ? undefined : "Hent gratis nøgle på api.nasa.gov og sæt NASA_API_KEY som env-var.",
    feature: "APOD-widget",
  };
}

async function dWeather(): Promise<Detection> {
  const loc = getLocation();
  const ok = await ping(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&current=temperature_2m`,
    4000
  );
  if (ok) return { key: "weather", name: "Vejr (Open-Meteo)", status: "ok", details: `Tilgængelig · ${loc.label}`, feature: "Vejr-widget" };
  return { key: "weather", name: "Vejr (Open-Meteo)", status: "partial", details: "API svarer ikke", feature: "Vejr-widget" };
}

// ── Geocoding ─────────────────────────────────────────────────────────────────

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
}

export async function geocodeCity(city: string): Promise<LocationSetting | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=da&format=json`;
  const data = await fetchJson<{ results?: GeoResult[] }>(url, 6000);
  const r = data?.results?.[0];
  if (!r) return null;
  return {
    lat: r.latitude,
    lng: r.longitude,
    label: r.admin1 ? `${r.name}, ${r.admin1}` : `${r.name}, ${r.country}`,
  };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function GET() {
  const [
    internet, node, autostart, daemon, paseo,
    lmStudio, github, weather, nasaApod,
    plex, tailscale, ntfy,
  ] = await Promise.all([
    dInternet(), dNode(), dLaunchAgents(), dDaemon(), dPaseo(),
    dLmStudio(), dGitHub(), dWeather(), dNasaApod(),
    dPlex(), dTailscale(), dNtfy(),
  ]);

  const detections: Detection[] = [
    internet, node, autostart, daemon, paseo,
    lmStudio, github, weather, nasaApod,
    plex, tailscale, ntfy,
  ];

  const summary = {
    ok: detections.filter((d) => d.status === "ok").length,
    partial: detections.filter((d) => d.status === "partial").length,
    missing: detections.filter((d) => d.status === "missing").length,
    total: detections.length,
  };

  const profile = {
    name: getUserName(),
    location: getLocation(),
  };

  return NextResponse.json({ detections, summary, profile, at: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  let body: { name?: string; city?: string } = {};
  try { body = await req.json() as typeof body; } catch { /* noop */ }

  const saved: Record<string, unknown> = {};

  // Save name
  if (typeof body.name === "string" && body.name.trim()) {
    setUserName(body.name.trim());
    saved.name = getUserName();
  }

  // Geocode city → save location
  if (typeof body.city === "string" && body.city.trim()) {
    const loc = await geocodeCity(body.city.trim());
    if (loc) {
      setSettingJSON("location", loc);
      saved.location = loc;
    } else {
      return NextResponse.json({ ok: false, error: `Kunne ikke finde "${body.city}" — prøv et andet bynavn.` }, { status: 422 });
    }
  }

  return NextResponse.json({ ok: true, saved });
}
