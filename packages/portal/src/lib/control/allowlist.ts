/**
 * Control-modulet — whitelist af services og apps som SKYNET må styre.
 *
 * Hardcoded defaults her; kan overskrives via settings-key "control_allowlist"
 * (samme JSON-struktur). Alt der IKKE står på listen bliver afvist af API'et.
 */

import { getSettingJSON } from "../settings";

export interface ServiceAllowEntry {
  /** LaunchAgent/Daemon label, fx "com.skynet.dashboard" */
  label: string;
  /** Visningsnavn */
  name: string;
  /** Kort beskrivelse vist i UI */
  description?: string;
  /** Hvilke actions denne service tillader */
  actions: Array<"start" | "stop" | "restart" | "status">;
  /** Kategori for gruppering */
  category?: "core" | "ai" | "network" | "media" | "tools";
}

export interface AppAllowEntry {
  /** Visningsnavn i /Applications eller ~/Applications */
  name: string;
  /** Valgfrit bundle-id, fx "com.apple.Safari" */
  bundleId?: string;
  /** Emoji til UI */
  icon?: string;
  /** Kategori */
  category?: "ai" | "dev" | "media" | "productivity" | "system";
}

export interface Allowlist {
  services: ServiceAllowEntry[];
  apps: AppAllowEntry[];
}

export const DEFAULT_ALLOWLIST: Allowlist = {
  services: [
    {
      label: "com.skynet.dashboard",
      name: "SKYNET Dashboard",
      description: "Next.js server på port 3100",
      actions: ["status", "restart"],
      category: "core",
    },
    {
      label: "com.tailscale.tailscaled",
      name: "Tailscale",
      description: "Mesh VPN-klient",
      actions: ["status", "start", "stop", "restart"],
      category: "network",
    },
    {
      label: "homebrew.mxcl.tailscale",
      name: "Tailscale (brew)",
      description: "Brew-installeret Tailscale",
      actions: ["status", "start", "stop", "restart"],
      category: "network",
    },
  ],
  apps: [
    { name: "LM Studio", icon: "🧠", category: "ai" },
    { name: "Claude", icon: "🤖", category: "ai" },
    { name: "Visual Studio Code", icon: "💻", category: "dev" },
    { name: "Cursor", icon: "✏️", category: "dev" },
    { name: "Xcode", icon: "🔨", category: "dev" },
    { name: "Ghostty", icon: "👻", category: "dev" },
    { name: "Terminal", icon: "⌨️", category: "dev" },
    { name: "Plex Media Server", icon: "🎬", category: "media" },
    { name: "Spotify", icon: "🎵", category: "media" },
    { name: "Safari", icon: "🧭", category: "productivity" },
    { name: "Finder", icon: "📁", category: "system" },
  ],
};

export function getAllowlist(): Allowlist {
  return getSettingJSON<Allowlist>("control_allowlist", DEFAULT_ALLOWLIST);
}

export function isServiceAllowed(
  label: string,
  action: ServiceAllowEntry["actions"][number]
): ServiceAllowEntry | null {
  const entry = getAllowlist().services.find((s) => s.label === label);
  if (!entry) return null;
  if (!entry.actions.includes(action)) return null;
  return entry;
}

export function isAppAllowed(name: string): AppAllowEntry | null {
  return getAllowlist().apps.find((a) => a.name === name) ?? null;
}
