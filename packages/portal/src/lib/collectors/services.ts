import { exec } from "child_process";
import { promisify } from "util";
import net from "node:net";

const execAsync = promisify(exec);

export interface ServicePort {
  port: number;
  label: string;
  category: "skynet" | "dev" | "database" | "media" | "system" | "other";
  pid: number | null;
  command: string | null;
  listening: boolean;
  responsive: boolean | null; // null = not checked (non-http)
  url?: string;
  external?: boolean; // bound to non-localhost
}

// Well-known ports to label and probe. Extend this list over time.
const KNOWN: Array<Omit<ServicePort, "pid" | "command" | "listening" | "responsive">> = [
  { port: 3100, label: "Skynet Portal", category: "skynet", url: "http://localhost:3100" },
  { port: 6767, label: "Skynet Daemon", category: "skynet" },
  { port: 3000, label: "Next.js dev", category: "dev", url: "http://localhost:3000" },
  { port: 3001, label: "rpa-flowchart", category: "dev", url: "http://localhost:3001" },
  { port: 3002, label: "streamgate", category: "dev", url: "http://localhost:3002" },
  { port: 4173, label: "Vite preview", category: "dev", url: "http://localhost:4173" },
  { port: 5173, label: "Vite dev", category: "dev", url: "http://localhost:5173" },
  { port: 8080, label: "HTTP alt", category: "dev", url: "http://localhost:8080" },
  { port: 8765, label: "Command Center", category: "dev", url: "http://localhost:8765" },
  { port: 5432, label: "PostgreSQL", category: "database" },
  { port: 3306, label: "MySQL", category: "database" },
  { port: 6379, label: "Redis", category: "database" },
  { port: 27017, label: "MongoDB", category: "database" },
  { port: 32400, label: "Plex", category: "media", url: "http://localhost:32400/web" },
  { port: 8096, label: "Jellyfin", category: "media", url: "http://localhost:8096" },
  { port: 6767, label: "Sonarr/Daemon", category: "media" },
  { port: 8989, label: "Sonarr", category: "media", url: "http://localhost:8989" },
  { port: 7878, label: "Radarr", category: "media", url: "http://localhost:7878" },
  { port: 5000, label: "Flask/Dev", category: "dev", url: "http://localhost:5000" },
  { port: 5555, label: "Dev server", category: "dev" },
  { port: 53, label: "DNS", category: "system" },
  { port: 22, label: "SSH", category: "system" },
  { port: 631, label: "CUPS (print)", category: "system" },
];

function checkPort(port: number, timeoutMs = 250): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, "127.0.0.1");
  });
}

async function httpProbe(url: string, timeoutMs = 500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, method: "HEAD" }).catch(() =>
      fetch(url, { signal: ctrl.signal, method: "GET" })
    );
    clearTimeout(id);
    return res.ok || (res.status >= 300 && res.status < 500);
  } catch {
    return false;
  }
}

interface LsofEntry {
  port: number;
  pid: number;
  command: string;
  external: boolean;
}

async function parseLsof(): Promise<LsofEntry[]> {
  // lsof -nP -iTCP -sTCP:LISTEN → lines like:
  // COMMAND   PID USER   FD   TYPE DEVICE  SIZE/OFF NODE NAME
  // node   12345 pav   22u  IPv4 0x...      0t0 TCP *:3100 (LISTEN)
  try {
    const { stdout } = await execAsync("lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null", {
      timeout: 2500,
      maxBuffer: 2 * 1024 * 1024,
    });
    const lines = stdout.split("\n").slice(1).filter(Boolean);
    const out: LsofEntry[] = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;
      const command = parts[0] ?? "";
      const pid = Number.parseInt(parts[1] ?? "0", 10);
      const name = parts.slice(8).join(" "); // NAME field may contain spaces
      // Example NAME: *:3100 or 127.0.0.1:6767 or [::1]:8080
      const m = name.match(/(?::)(\d+)\s+\(LISTEN\)$/);
      if (!m) continue;
      const port = Number.parseInt(m[1] ?? "0", 10);
      const external = !name.startsWith("127.0.0.1") && !name.startsWith("[::1]");
      out.push({ port, pid, command, external });
    }
    return out;
  } catch {
    return [];
  }
}

export async function collect(): Promise<{ services: ServicePort[]; fetchedAt: string }> {
  const lsof = await parseLsof();
  const byPort = new Map<number, LsofEntry>();
  for (const e of lsof) byPort.set(e.port, e);

  // Merge KNOWN with detected
  const seen = new Set<number>();
  const services: ServicePort[] = [];

  for (const k of KNOWN) {
    seen.add(k.port);
    const hit = byPort.get(k.port);
    const listening = Boolean(hit);
    let responsive: boolean | null = null;
    if (listening && k.url) {
      responsive = await httpProbe(k.url).catch(() => false);
    } else if (listening) {
      responsive = await checkPort(k.port).catch(() => false);
    }
    services.push({
      port: k.port,
      label: k.label,
      category: k.category,
      pid: hit?.pid ?? null,
      command: hit?.command ?? null,
      listening,
      responsive,
      url: k.url,
      external: hit?.external,
    });
  }

  // Include unknown listening ports that aren't in KNOWN
  for (const hit of lsof) {
    if (seen.has(hit.port)) continue;
    services.push({
      port: hit.port,
      label: hit.command || `port ${hit.port}`,
      category: "other",
      pid: hit.pid,
      command: hit.command,
      listening: true,
      responsive: null,
      external: hit.external,
    });
  }

  services.sort((a, b) => {
    const cat = ["skynet", "dev", "media", "database", "system", "other"];
    const ca = cat.indexOf(a.category);
    const cb = cat.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.port - b.port;
  });

  return { services, fetchedAt: new Date().toISOString() };
}
