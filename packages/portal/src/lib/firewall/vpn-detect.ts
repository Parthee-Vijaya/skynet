/**
 * Detect om en forbindelse går igennem en VPN, mesh-netværk eller proxy.
 *
 * Vi analyserer både:
 *   1. Local-side: IP-range på laddr (Tailscale CGNAT 100.64.0.0/10 etc.)
 *   2. Remote-side: hostname / ASN matcher kendte VPN-providers
 */

export interface VpnDetection {
  /** Om vi mener forbindelsen er VPN/mesh-baseret. */
  isVpn: boolean;
  /** Provider hvis identificeret. */
  provider:
    | "tailscale"
    | "proton"
    | "mullvad"
    | "wireguard"
    | "ipsec"
    | "openvpn"
    | "nordvpn"
    | "expressvpn"
    | "unknown"
    | null;
  /** Hvad pegede os på provider'en — for transparens. */
  signals: string[];
  /** Trust-bias: en kendt VPN-tunnel = +2 til trust score. */
  trustBoost: number;
}

// ── IP-range matchers ────────────────────────────────────────────────────────

/** Tailscale CGNAT-range. Alle Tailscale-noder har 100.64.0.0/10. */
function ipInTailscaleRange(ip: string): boolean {
  if (!ip) return false;
  const m = ip.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // 100.64.0.0/10 = 100.64.x.x – 100.127.x.x
  return a === 100 && b >= 64 && b <= 127;
}

/**
 * IPv6 ULA-range fc00::/7 — Tailscale tildeler IPv6 ULA-adresser i fd7a:115c:a1e0::/48.
 * Andet ULA-range (Yggdrasil etc.) flagges også som "private mesh".
 */
function ipIsPrivateIpv6Mesh(ip: string): boolean {
  return /^f[cd][0-9a-f]{2}:/i.test(ip);
}

function ipIsPrivate(ip: string): boolean {
  if (!ip) return false;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^127\./.test(ip)) return true;
  return false;
}

// ── Hostname-pattern matchers ────────────────────────────────────────────────

interface ProviderRule {
  provider: VpnDetection["provider"];
  hostPatterns: RegExp[];
  /** ASN-organization-substrings (case-insensitive). */
  asnOrgs?: string[];
}

const PROVIDER_RULES: ProviderRule[] = [
  {
    provider: "tailscale",
    hostPatterns: [
      /\.ts\.net$/i,
      /tailscale\.com$/i,
      /derpmap\.tailscale\.com$/i,
      /controlplane\.tailscale\.com$/i,
    ],
    asnOrgs: ["Tailscale"],
  },
  {
    provider: "proton",
    hostPatterns: [/protonvpn\.(com|ch|net)$/i, /proton\.me$/i, /-vpn\.proton\./i],
    asnOrgs: ["Proton AG", "ProtonMail"],
  },
  {
    provider: "mullvad",
    hostPatterns: [/mullvad\.net$/i, /\.mullvad\.net$/i],
    asnOrgs: ["Mullvad", "31bis Sweden"],
  },
  {
    provider: "nordvpn",
    hostPatterns: [/\.nordvpn\.com$/i, /nordvpn\.com$/i],
    asnOrgs: ["NordVPN", "Tefincom"],
  },
  {
    provider: "expressvpn",
    hostPatterns: [/expressvpn\.com$/i, /express-?vpn/i],
    asnOrgs: ["ExpressVPN", "Express"],
  },
];

// ── Local-NIC detection ──────────────────────────────────────────────────────

function detectLocalInterface(laddr: string | null): {
  iface: string | null;
  provider: VpnDetection["provider"];
} {
  if (!laddr) return { iface: null, provider: null };
  if (ipInTailscaleRange(laddr)) return { iface: "tailscale0", provider: "tailscale" };
  return { iface: null, provider: null };
}

// ── Main detect ──────────────────────────────────────────────────────────────

export interface VpnDetectInput {
  raddr: string | null;
  rhost?: string | null;
  laddr?: string | null;
  asnOrg?: string | null;
}

export function detectVpn(input: VpnDetectInput): VpnDetection {
  const signals: string[] = [];
  let provider: VpnDetection["provider"] = null;

  // 1) Local interface — strongest signal (vi KENDER vores egen NIC)
  const local = detectLocalInterface(input.laddr ?? null);
  if (local.provider) {
    provider = local.provider;
    signals.push(`local-interface: ${local.iface}`);
  }

  // 2) Remote IP i Tailscale CGNAT range
  if (input.raddr && ipInTailscaleRange(input.raddr)) {
    if (!provider) provider = "tailscale";
    signals.push(`raddr ${input.raddr} ∈ 100.64.0.0/10 (Tailscale CGNAT)`);
  }

  // 3) IPv6 ULA mesh (Tailscale, Yggdrasil, etc.)
  if (input.raddr && ipIsPrivateIpv6Mesh(input.raddr)) {
    if (!provider) provider = "tailscale";
    signals.push(`raddr er IPv6 ULA (private mesh)`);
  }

  // 4) Hostname patterns
  if (input.rhost) {
    for (const rule of PROVIDER_RULES) {
      for (const re of rule.hostPatterns) {
        if (re.test(input.rhost)) {
          if (!provider) provider = rule.provider;
          signals.push(`rhost matcher ${rule.provider}: ${re.source}`);
          break;
        }
      }
    }
  }

  // 5) ASN org match
  if (input.asnOrg) {
    const asnLower = input.asnOrg.toLowerCase();
    for (const rule of PROVIDER_RULES) {
      if (!rule.asnOrgs) continue;
      for (const org of rule.asnOrgs) {
        if (asnLower.includes(org.toLowerCase())) {
          if (!provider) provider = rule.provider;
          signals.push(`ASN-org "${input.asnOrg}" matcher ${rule.provider}`);
          break;
        }
      }
    }
  }

  // 6) Plain private IP — local network, ikke VPN
  if (!provider && input.raddr && ipIsPrivate(input.raddr)) {
    signals.push(`raddr ${input.raddr} er private/LAN`);
  }

  const isVpn = provider !== null;
  return {
    isVpn,
    provider,
    signals,
    trustBoost: isVpn ? 2 : 0,
  };
}

/** Common well-known port → service-navn mapping. */
export function classifyPort(
  port: number | null,
  proto: string
): { service: string | null; secure: boolean | null } {
  if (!port) return { service: null, secure: null };
  switch (port) {
    case 80: return { service: "HTTP", secure: false };
    case 443: return { service: "HTTPS", secure: true };
    case 22: return { service: "SSH", secure: true };
    case 21: return { service: "FTP", secure: false };
    case 25: return { service: "SMTP", secure: false };
    case 587: return { service: "SMTP/STARTTLS", secure: true };
    case 465: return { service: "SMTPS", secure: true };
    case 993: return { service: "IMAPS", secure: true };
    case 143: return { service: "IMAP", secure: false };
    case 995: return { service: "POP3S", secure: true };
    case 110: return { service: "POP3", secure: false };
    case 53: return { service: "DNS", secure: false };
    case 853: return { service: "DNS-over-TLS", secure: true };
    case 5223: return { service: "Apple Push Notification", secure: true };
    case 8883: return { service: "MQTT/TLS", secure: true };
    case 1883: return { service: "MQTT", secure: false };
    case 3478: return { service: "STUN/WebRTC", secure: false };
    case 41641: return { service: "Tailscale (WireGuard)", secure: true };
    case 51820: return { service: "WireGuard", secure: true };
    case 1194: return { service: "OpenVPN", secure: true };
    case 500: return { service: "IKEv2/IPSec", secure: true };
    case 4500: return { service: "IPSec NAT-T", secure: true };
    case 5060: return { service: "SIP", secure: false };
    case 5061: return { service: "SIP-TLS", secure: true };
    case 1234: return { service: "LM Studio (lokal)", secure: false };
    case 6767: return { service: "Skynet daemon", secure: false };
    case 3100: return { service: "Skynet portal", secure: false };
    case 8096: return { service: "Jellyfin", secure: false };
    case 32400: return { service: "Plex", secure: false };
    case 11434: return { service: "Ollama", secure: false };
    case 8080: return { service: "HTTP-alt", secure: false };
    case 8443: return { service: "HTTPS-alt", secure: true };
    case 3000: case 3001: case 5173: case 5174: case 8000:
      return { service: "dev-server", secure: false };
    default:
      if (proto.startsWith("udp") && port >= 30000 && port <= 65535)
        return { service: "ephemeral UDP (game/voice/RTP)", secure: null };
      if (port >= 49152) return { service: "ephemeral", secure: null };
      return { service: null, secure: null };
  }
}
