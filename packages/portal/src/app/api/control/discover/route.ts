import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/control/auth";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";
const exec = promisify(execCb);

/**
 * Auto-discovery: detekterer hvilke lokale services/data-kilder der er klar.
 * Kører på setup-wizarden + kan bruges til status senere.
 */

interface Detection {
  key: string;
  name: string;
  status: "ok" | "missing" | "partial" | "unknown";
  details?: string;
  /** Hvad brugeren skal gøre hvis ikke OK */
  hint?: string;
  /** Hvilken widget/feature der drager nytte */
  feature: string;
  /** Er detten allerede konfigureret i settings? */
  configured?: boolean;
}

async function ping(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    return res.ok || res.status < 500; // accepter 401/404 — serveren svarer jo
  } catch {
    return false;
  }
}

async function fetchJson<T>(url: string, timeoutMs = 1500): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function hasCommand(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await exec(`command -v ${cmd}`, { timeout: 2000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function detectLmStudio(): Promise<Detection> {
  const baseUrl = getSetting("llm_base_url") || "http://localhost:1234/v1";
  const models = await fetchJson<{ data: Array<{ id: string }> }>(
    `${baseUrl.replace(/\/$/, "")}/models`
  );
  if (models && Array.isArray(models.data)) {
    return {
      key: "lm_studio",
      name: "LM Studio",
      status: "ok",
      details: `${models.data.length} model(ler) loaded: ${models.data
        .slice(0, 3)
        .map((m) => m.id)
        .join(", ")}${models.data.length > 3 ? "…" : ""}`,
      feature: "Chat (/chat)",
      configured: true,
    };
  }
  return {
    key: "lm_studio",
    name: "LM Studio",
    status: "missing",
    hint: "Installer LM Studio fra https://lmstudio.ai, load en model, og start Local Server på port 1234.",
    feature: "Chat (/chat)",
  };
}

async function detectPlex(): Promise<Detection> {
  const token = getSetting("plex_token");
  const url = getSetting("plex_url") || "http://localhost:32400";

  // Tjek om Plex Media Server kører lokalt (port 32400)
  const serverUp = await ping(`${url}/identity`);

  if (!serverUp) {
    return {
      key: "plex",
      name: "Plex Media Server",
      status: "missing",
      hint: "Plex-serveren er ikke tilgængelig på " + url + ". Start Plex Media Server på denne Mac, eller sæt plex_url til en ekstern Plex.",
      feature: "PlexWidget",
    };
  }

  if (!token) {
    return {
      key: "plex",
      name: "Plex Media Server",
      status: "partial",
      details: "Plex kører på " + url + ", men plex_token mangler",
      hint: "Gå til https://plex.tv/claim, hent token, gem som plex_token i settings.",
      feature: "PlexWidget",
    };
  }

  return {
    key: "plex",
    name: "Plex Media Server",
    status: "ok",
    details: "Kører på " + url + " med token",
    feature: "PlexWidget",
    configured: true,
  };
}

async function detectTailscale(): Promise<Detection> {
  const paths = [
    "/Applications/Tailscale.app",
    "/opt/homebrew/bin/tailscale",
    "/usr/local/bin/tailscale",
  ];
  for (const p of paths) {
    if (await fileExists(p)) {
      return {
        key: "tailscale",
        name: "Tailscale",
        status: "ok",
        details: "Fundet på " + p,
        feature: "Mission control · Services",
        configured: true,
      };
    }
  }
  return {
    key: "tailscale",
    name: "Tailscale",
    status: "missing",
    hint: "Installer fra https://tailscale.com/download/mac hvis du vil kunne styre den via mission control.",
    feature: "Mission control · Services",
  };
}

async function detectTmux(): Promise<Detection> {
  const p = await hasCommand("tmux");
  if (p) {
    return {
      key: "tmux",
      name: "tmux",
      status: "ok",
      details: p,
      feature: "Pocket Agents",
      configured: true,
    };
  }
  return {
    key: "tmux",
    name: "tmux",
    status: "missing",
    hint: "Kør ./scripts/bootstrap-pocket-agents.sh eller 'brew install tmux'",
    feature: "Pocket Agents",
  };
}

async function detectBrrr(): Promise<Detection> {
  const p = await hasCommand("brrr");
  if (p) {
    return {
      key: "brrr",
      name: "brrr CLI",
      status: "ok",
      details: p,
      feature: "Pocket Agents · idle-notify",
      configured: true,
    };
  }
  return {
    key: "brrr",
    name: "brrr CLI",
    status: "missing",
    hint: "Kør bootstrap-scriptet eller 'brew tap simonbs/brrr-cli && brew install brrr'",
    feature: "Pocket Agents · idle-notify",
  };
}

async function detectZshrcAutoAttach(): Promise<Detection> {
  const zshrc = join(homedir(), ".zshrc");
  if (!(await fileExists(zshrc))) {
    return {
      key: "zshrc-tmux",
      name: ".zshrc auto-attach",
      status: "missing",
      details: "~/.zshrc eksisterer ikke",
      hint: "Kør scripts/bootstrap-pocket-agents.sh",
      feature: "Pocket Agents · SSH auto-tmux",
    };
  }
  try {
    const content = await fs.readFile(zshrc, "utf8");
    const patched = content.includes("skynet: auto-attach to tmux on SSH");
    if (patched) {
      return {
        key: "zshrc-tmux",
        name: ".zshrc auto-attach",
        status: "ok",
        details: "SSH attacher til 'agents' tmux-session",
        feature: "Pocket Agents · SSH auto-tmux",
        configured: true,
      };
    }
    return {
      key: "zshrc-tmux",
      name: ".zshrc auto-attach",
      status: "partial",
      details: "~/.zshrc eksisterer men er ikke patchet",
      hint: "Kør scripts/bootstrap-pocket-agents.sh",
      feature: "Pocket Agents · SSH auto-tmux",
    };
  } catch {
    return {
      key: "zshrc-tmux",
      name: ".zshrc auto-attach",
      status: "missing",
      feature: "Pocket Agents · SSH auto-tmux",
    };
  }
}

async function detectNzbgeek(): Promise<Detection> {
  const url = getSetting("nzbgeek_rss_url");
  if (!url) {
    return {
      key: "nzbgeek",
      name: "NZBGeek RSS",
      status: "missing",
      hint: "Hvis du vil se NZB-widgetten: hent din personlige RSS URL fra https://nzbgeek.info og gem som nzbgeek_rss_url i settings.",
      feature: "NzbWidget",
    };
  }
  return {
    key: "nzbgeek",
    name: "NZBGeek RSS",
    status: "ok",
    details: "RSS URL konfigureret",
    feature: "NzbWidget",
    configured: true,
  };
}

async function detectGitHub(): Promise<Detection> {
  const user = process.env.GITHUB_USER || "";
  const ok = await ping(`https://api.github.com/users/${user}`);
  if (!ok) {
    return {
      key: "github",
      name: "GitHub",
      status: "partial",
      details: `Kunne ikke nå api.github.com (eller rate-limit)`,
      feature: "GithubWidget",
    };
  }
  return {
    key: "github",
    name: "GitHub",
    status: "ok",
    details: `Bruger: ${user}`,
    feature: "GithubWidget",
    configured: true,
  };
}

async function detectNasaApod(): Promise<Detection> {
  const hasKey = !!process.env.NASA_API_KEY && process.env.NASA_API_KEY !== "DEMO_KEY";
  return {
    key: "nasa_apod",
    name: "NASA APOD",
    status: hasKey ? "ok" : "partial",
    details: hasKey
      ? "API-nøgle sat"
      : "Kører på DEMO_KEY (begrænset til ~30 kald/time)",
    hint: hasKey
      ? undefined
      : "Hent gratis nøgle på https://api.nasa.gov og sæt NASA_API_KEY som env-var.",
    feature: "ApodWidget",
    configured: true,
  };
}

async function detectLocation(): Promise<Detection> {
  const loc = getSetting("location");
  if (!loc) {
    return {
      key: "location",
      name: "Lokation",
      status: "partial",
      details: "Bruger default: København (55.68, 12.57)",
      hint: "Gå til /settings og sæt din faktiske lokation for mere retvisende vejr/energi/fly-data.",
      feature: "Weather/Air/Energy/Flights",
      configured: false,
    };
  }
  try {
    const parsed = JSON.parse(loc);
    return {
      key: "location",
      name: "Lokation",
      status: "ok",
      details: parsed.label ?? `${parsed.lat}, ${parsed.lng}`,
      feature: "Weather/Air/Energy/Flights",
      configured: true,
    };
  } catch {
    return {
      key: "location",
      name: "Lokation",
      status: "partial",
      feature: "Weather/Air/Energy/Flights",
    };
  }
}

async function detectControlToken(): Promise<Detection> {
  const t = getSetting("control_token");
  return {
    key: "control_token",
    name: "Control API token",
    status: t ? "ok" : "missing",
    details: t ? "Token genereret (same-origin + token-auth)" : "Genereres ved første kald",
    feature: "Ekstern API-adgang",
    configured: !!t,
  };
}

async function detectNode(): Promise<Detection> {
  const nodeV = process.version;
  return {
    key: "node",
    name: "Node.js",
    status: "ok",
    details: nodeV,
    feature: "Runtime",
    configured: true,
  };
}

async function detectLaunchAgent(): Promise<Detection> {
  const plist = join(homedir(), "Library", "LaunchAgents", "com.skynet.dashboard.plist");
  const exists = await fileExists(plist);
  if (!exists) {
    return {
      key: "launchagent",
      name: "Autostart (LaunchAgent)",
      status: "missing",
      hint: "Kør ./scripts/install.sh for at installere autostart ved login.",
      feature: "Autostart",
    };
  }
  return {
    key: "launchagent",
    name: "Autostart (LaunchAgent)",
    status: "ok",
    details: plist,
    feature: "Autostart",
    configured: true,
  };
}

async function detectOutboundInternet(): Promise<Detection> {
  // Prøv et par fallback-URL'er så vi ikke fejler pga. én langsom API
  const targets = [
    "https://api.github.com",
    "https://api.open-meteo.com/v1/forecast?latitude=55.68&longitude=12.57&current=temperature_2m",
    "https://1.1.1.1",
  ];
  for (const t of targets) {
    if (await ping(t, 5000)) {
      return {
        key: "internet",
        name: "Internet",
        status: "ok",
        details: `Forbundet (${new URL(t).host})`,
        feature: "WeatherWidget m.fl.",
        configured: true,
      };
    }
  }
  return {
    key: "internet",
    name: "Internet",
    status: "missing",
    details: "Ingen af kontrol-URLerne svarede",
    feature: "WeatherWidget m.fl.",
    configured: true,
  };
}

export async function GET(req: Request) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;

  const detections = await Promise.all([
    detectNode(),
    detectLaunchAgent(),
    detectOutboundInternet(),
    detectLocation(),
    detectLmStudio(),
    detectPlex(),
    detectTailscale(),
    detectTmux(),
    detectBrrr(),
    detectZshrcAutoAttach(),
    detectNzbgeek(),
    detectGitHub(),
    detectNasaApod(),
    detectControlToken(),
  ]);

  const summary = {
    ok: detections.filter((d) => d.status === "ok").length,
    partial: detections.filter((d) => d.status === "partial").length,
    missing: detections.filter((d) => d.status === "missing").length,
    total: detections.length,
  };

  return NextResponse.json({ detections, summary, at: new Date().toISOString() });
}
