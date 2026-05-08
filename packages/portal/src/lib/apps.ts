/**
 * Apps-hub registry — KLIENT-SAFE typer og defaults.
 *
 * Dette modul må importeres fra både server- og klient-komponenter.
 * Funktioner der læser/skriver settings (DB-afhængige) ligger i
 * `apps.server.ts` og må kun importeres fra server-routes.
 */

export type AppKind = "web" | "native-mac" | "native-ios" | "daemon";

export interface AppEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  kind: AppKind;
  /** http://localhost:PORT/ — bruges når browser sidder lokalt på Mac */
  localUrl?: string;
  /** http://<tailscale-ip>:PORT/ — bruges når browser sidder på iPhone via Tailscale */
  tailscaleUrl?: string;
  /** Server-side health-ping. Returnerer 2xx = ok. */
  healthUrl?: string;
  /** kun native-mac: brugt af /api/apps/launch til `open -a` */
  appName?: string;
  /** kun native-ios: tekst der vises i kortet */
  iosNote?: string;
  /** Hvis disabled, vises kortet ikke på /apps. */
  disabled?: boolean;
}

export interface AppOverride {
  localUrl?: string;
  tailscaleUrl?: string;
  healthUrl?: string;
  disabled?: boolean;
}

export type AppOverrides = Record<string, AppOverride>;

const TAILSCALE_IP = "100.106.255.41";

export const DEFAULT_APPS: AppEntry[] = [
  {
    id: "skynet",
    name: "Skynet",
    description: "Cockpit, automations, agents, chat",
    icon: "◉",
    kind: "web",
    localUrl: "http://localhost:3100/",
    tailscaleUrl: `http://${TAILSCALE_IP}:3100/`,
    healthUrl: "http://localhost:3100/api/system",
  },
  {
    id: "bifrost",
    name: "Bifrost",
    description: "Digital tvilling · iMessage + SMS",
    icon: "◆",
    kind: "web",
    localUrl: "http://localhost:3737/",
    tailscaleUrl: `http://${TAILSCALE_IP}:3737/`,
    healthUrl: "http://localhost:3737/",
  },
  {
    id: "odin",
    name: "Odin",
    description: "Personlig RAG-vidensbase",
    icon: "◈",
    kind: "web",
    localUrl: "http://localhost:3839/",
    tailscaleUrl: `http://${TAILSCALE_IP}:3839/`,
    healthUrl: "http://localhost:3838/health",
  },
  {
    id: "judge-dredd",
    name: "Judge Dredd",
    description: "AI-compliance · Kalundborg",
    icon: "⚖",
    kind: "web",
    localUrl: "http://localhost:8090/",
    tailscaleUrl: `http://${TAILSCALE_IP}:8090/`,
    healthUrl: "http://localhost:8001/api/health",
  },
  {
    id: "clew",
    name: "Clew",
    description: "Læringsmaps · dependency graphs",
    icon: "◊",
    kind: "web",
    localUrl: "http://localhost:5178/",
    tailscaleUrl: `http://${TAILSCALE_IP}:5178/`,
    healthUrl: "http://localhost:8787/healthz",
  },
  {
    id: "saga",
    name: "Saga",
    description: "Mac voice assistant · ⌥",
    icon: "🎙",
    kind: "native-mac",
    appName: "Saga",
  },
  {
    id: "autobot",
    name: "Autobot",
    description: "iOS app",
    icon: "📱",
    kind: "native-ios",
    iosNote: "Åbn Autobot på iPhone",
  },
  {
    id: "research-agent",
    name: "Research-agent",
    description: "Email-research daemon",
    icon: "✉",
    kind: "daemon",
  },
  {
    id: "mimir",
    name: "Mímir",
    description: "Personlighedsprofil · DISC + HBDI + Enneagram",
    icon: "✦",
    kind: "web",
    localUrl: "http://localhost:3200/",
    tailscaleUrl: `http://${TAILSCALE_IP}:3200/`,
    healthUrl: "http://localhost:3200/api/health",
  },
];

/**
 * Vælger URL ud fra host-hint. Klient-safe.
 * Bruges af /apps-siden — sender `window.location.hostname`.
 */
export function pickAppUrl(app: AppEntry, hostHint?: string): string | undefined {
  const isTailscale = hostHint?.startsWith("100.") ?? false;
  if (isTailscale && app.tailscaleUrl) return app.tailscaleUrl;
  return app.localUrl ?? app.tailscaleUrl;
}
