import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface LsofConnection {
  pid: number;
  process: string;
  proto: string;        // 'tcp4' | 'tcp6' | 'udp4' | 'udp6'
  laddr: string | null;
  lport: number | null;
  raddr: string | null;
  rport: number | null;
  state: string | null; // 'ESTABLISHED' | 'LISTEN' | 'SYN_SENT' | etc.
}

const PROTO_MAP: Record<string, string> = {
  IPv4: "tcp4",
  IPv6: "tcp6",
};

function parseEndpoint(s: string): { addr: string | null; port: number | null } {
  // IPv6: "[2001:db8::1]:443" → addr=2001:db8::1, port=443
  // IPv4: "10.0.0.1:443"     → addr=10.0.0.1, port=443
  // Wildcard: "*:443"         → addr=null, port=443
  // Just port: ":443"         → addr=null, port=443
  if (!s || s === "*:*") return { addr: null, port: null };

  const v6 = s.match(/^\[([^\]]+)\]:(\d+|\*)$/);
  if (v6) {
    const port = v6[2] === "*" ? null : Number(v6[2]);
    return { addr: v6[1] === "*" ? null : v6[1], port: Number.isFinite(port) ? port : null };
  }

  const idx = s.lastIndexOf(":");
  if (idx === -1) return { addr: s, port: null };
  const host = s.slice(0, idx);
  const portStr = s.slice(idx + 1);
  const port = portStr === "*" ? null : Number(portStr);
  return {
    addr: !host || host === "*" ? null : host,
    port: Number.isFinite(port) ? port : null,
  };
}

/**
 * Run `lsof -P -i -n` and parse active network connections.
 *
 * Output format (header + rows):
 *   COMMAND   PID  USER  FD   TYPE   DEVICE  SIZE/OFF  NODE  NAME
 *   Spotify   123  user  42u  IPv4   0xabcd  0t0       TCP   10.0.0.1:54321->1.2.3.4:443 (ESTABLISHED)
 *
 * The NAME column may contain a "->" arrow (TCP/connected) or just an address (UDP/listen).
 * State is in parentheses at the end (TCP only).
 */
export async function runLsof(timeoutMs = 5000): Promise<LsofConnection[]> {
  const { stdout } = await execAsync("/usr/sbin/lsof -P -i -n", {
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseLsofOutput(stdout);
}

export function parseLsofOutput(stdout: string): LsofConnection[] {
  const conns: LsofConnection[] = [];
  const lines = stdout.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("COMMAND")) continue;

    // Tokenize on whitespace — first 8 fields are positional, rest is NAME.
    // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;

    const command = parts[0];
    const pid = Number(parts[1]);
    if (!Number.isFinite(pid)) continue;

    const type = parts[4];                  // IPv4 | IPv6
    const node = parts[7];                  // TCP | UDP
    const name = parts.slice(8).join(" ");  // address [-> address] [(STATE)]

    if (type !== "IPv4" && type !== "IPv6") continue;
    if (node !== "TCP" && node !== "UDP") continue;

    // State (TCP only) — "(ESTABLISHED)" at end
    let state: string | null = null;
    let rest = name;
    const stateMatch = name.match(/\(([^)]+)\)\s*$/);
    if (stateMatch) {
      state = stateMatch[1];
      rest = name.slice(0, stateMatch.index).trim();
    }

    // Local [-> Remote]
    const arrowIdx = rest.indexOf("->");
    let localStr: string;
    let remoteStr: string | null = null;
    if (arrowIdx === -1) {
      localStr = rest;
    } else {
      localStr = rest.slice(0, arrowIdx).trim();
      remoteStr = rest.slice(arrowIdx + 2).trim();
    }

    const local = parseEndpoint(localStr);
    const remote = remoteStr ? parseEndpoint(remoteStr) : { addr: null, port: null };

    const family = type === "IPv6" ? "6" : "4";
    const proto = (node === "TCP" ? "tcp" : "udp") + family;

    conns.push({
      pid,
      process: command,
      proto,
      laddr: local.addr,
      lport: local.port,
      raddr: remote.addr,
      rport: remote.port,
      state,
    });
  }

  return conns;
}

/** Connection-key for diff'ing snapshots. */
export function connKey(c: { pid: number; raddr: string | null; rport: number | null; proto: string }): string {
  return `${c.pid}:${c.proto}:${c.raddr ?? ""}:${c.rport ?? ""}`;
}
