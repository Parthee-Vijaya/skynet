import { runLsof, connKey, type LsofConnection } from "@/lib/firewall/lsof-parser";
import { runNettop, NettopDelta } from "@/lib/firewall/nettop-parser";
import {
  insertConnections,
  insertEvent,
  pruneNetwork,
  type ConnectionInsert,
} from "@/lib/firewall/store";
import { enqueueLookups } from "@/lib/firewall/geo";

const ACTIVE_INTERVAL_MS = 10_000;
const IDLE_INTERVAL_MS = 60_000;
const ACTIVE_WINDOW_MS = 60_000;     // hvis dashboard har pollet inden for 60s = aktiv
const PRUNE_EVERY_TICKS = 60;
const NEW_APP_DEDUPE_MS = 24 * 60 * 60 * 1000; // én "new_app"-event pr. process pr. døgn

// State must be shared across module instances (Next.js instrumentation runtime
// vs API-route runtime can end up with separate copies of module-locals).
// We keep it on globalThis so getNetworkCollectorStatus() always sees the same
// timer/tick state regardless of which entry-point imported this module.
interface CollectorState {
  timer: NodeJS.Timeout | null;
  started: boolean;
  lastDashboardSeen: number;
  prevKeys: Set<string>;
  lastTickAt: number | null;
  lastTickOk: boolean;
  tickCount: number;
  backoffMs: number;
  nettopDelta: NettopDelta;
  recentNewAppPush: Map<string, number>;
}

const STATE_KEY = "__skynet_network_collector_state__";

function getState(): CollectorState {
  const g = globalThis as unknown as Record<string, CollectorState>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      timer: null,
      started: false,
      lastDashboardSeen: 0,
      prevKeys: new Set<string>(),
      lastTickAt: null,
      lastTickOk: false,
      tickCount: 0,
      backoffMs: 0,
      nettopDelta: new NettopDelta(),
      recentNewAppPush: new Map<string, number>(),
    };
  }
  return g[STATE_KEY];
}

function isLoopbackOrPrivate(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.")) return true;
  if (ip.startsWith("::ffff:127.")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) return true;
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("172.")) {
    const second = Number(ip.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function markDashboardActive(): void {
  getState().lastDashboardSeen = Date.now();
}

/** Currying-helper for collector to fetch the marker without circular import. */
export function getMarkDashboardActive(): () => void {
  return markDashboardActive;
}

export function getNetworkCollectorStatus() {
  const s = getState();
  return {
    running: s.started,
    lastTickAt: s.lastTickAt,
    lastTickOk: s.lastTickOk,
    intervalMs: Date.now() - s.lastDashboardSeen < ACTIVE_WINDOW_MS ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS,
  };
}

async function tick(): Promise<void> {
  const s = getState();
  const t0 = Date.now();
  try {
    const [lsofResult, nettopResult] = await Promise.allSettled([runLsof(), runNettop()]);
    const conns: LsofConnection[] = lsofResult.status === "fulfilled" ? lsofResult.value : [];

    // bytes-delta map: pid → {in, out}
    const seenPids = new Set<number>();
    const byteMap = new Map<number, { in: number; out: number }>();
    if (nettopResult.status === "fulfilled") {
      for (const n of nettopResult.value) {
        seenPids.add(n.pid);
        byteMap.set(n.pid, s.nettopDelta.delta(n.pid, n));
      }
    }
    s.nettopDelta.prune(seenPids);
    if (nettopResult.status === "rejected" && s.tickCount < 3) {
      const reason = nettopResult.reason as { signal?: string };
      console.warn(
        `[network-collector] nettop fejlede (signal=${reason?.signal ?? "?"}) — bytes-statistikker bliver 0 indtil næste vellykkede tick`
      );
    }

    const ts = Date.now();
    const currentKeys = new Set<string>();
    const rows: ConnectionInsert[] = [];
    const newRemoteIps: string[] = [];

    // Distribute per-pid byte-delta proportionally across that pid's connections in this tick
    const connsByPid = new Map<number, LsofConnection[]>();
    for (const c of conns) {
      const list = connsByPid.get(c.pid);
      if (list) list.push(c);
      else connsByPid.set(c.pid, [c]);
    }

    // Reverse-DNS: slå op for alle unikke remote-IPs så rhost bliver populated.
    // Cache i 1h håndteret af reverse-dns-modulet. Lokale + Tailscale-IPs skipes.
    const uniqRemotes = new Set<string>();
    for (const c of conns) {
      if (c.raddr && c.state !== "LISTEN") uniqRemotes.add(c.raddr);
    }
    const { reverseLookupMany, pruneCache } = await import("@/lib/firewall/reverse-dns");
    const rdnsMap = await reverseLookupMany([...uniqRemotes]);
    if (s.tickCount % 60 === 0) pruneCache();

    for (const c of conns) {
      const k = connKey(c);
      currentKeys.add(k);
      const isNew = !s.prevKeys.has(k);

      const pidConnCount = connsByPid.get(c.pid)?.length ?? 1;
      const bytes = byteMap.get(c.pid);
      const bIn = bytes ? Math.round(bytes.in / pidConnCount) : 0;
      const bOut = bytes ? Math.round(bytes.out / pidConnCount) : 0;

      const rhost = c.raddr ? rdnsMap.get(c.raddr) ?? null : null;

      rows.push({
        ts,
        pid: c.pid,
        process: c.process,
        proto: c.proto,
        laddr: c.laddr,
        lport: c.lport,
        raddr: c.raddr,
        rport: c.rport,
        rhost,
        state: c.state,
        bytes_in: bIn,
        bytes_out: bOut,
        is_new: isNew,
      });

      if (isNew && c.raddr) newRemoteIps.push(c.raddr);

      // Emit new_app-event per (process, day) — guard against helper-process spam,
      // and skip loopback/private IPs (those aren't "phone home"-events).
      if (isNew && c.raddr && c.state !== "LISTEN" && !isLoopbackOrPrivate(c.raddr)) {
        const last = s.recentNewAppPush.get(c.process) ?? 0;
        if (Date.now() - last > NEW_APP_DEDUPE_MS) {
          s.recentNewAppPush.set(c.process, Date.now());
          insertEvent({
            kind: "new_app",
            process: c.process,
            raddr: c.raddr,
            detail: {
              proto: c.proto,
              rport: c.rport,
              state: c.state,
              first_seen_ts: ts,
            },
          });
        }
      }
    }

    insertConnections(rows);
    if (newRemoteIps.length > 0) enqueueLookups(newRemoteIps);

    s.prevKeys = currentKeys;
    s.lastTickAt = Date.now();
    s.lastTickOk = true;
    s.backoffMs = 0;
    s.tickCount += 1;

    if (s.tickCount % PRUNE_EVERY_TICKS === 0) pruneNetwork();
  } catch (e) {
    s.lastTickOk = false;
    s.lastTickAt = Date.now();
    s.backoffMs = s.backoffMs === 0 ? 5_000 : Math.min(s.backoffMs * 3, 5 * 60_000);
    console.error("[network-collector] tick failed:", e instanceof Error ? e.message : e);
  } finally {
    const elapsed = Date.now() - t0;
    const baseInterval =
      Date.now() - s.lastDashboardSeen < ACTIVE_WINDOW_MS ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
    const next = s.backoffMs > 0 ? s.backoffMs : Math.max(baseInterval - elapsed, 1_000);
    s.timer = setTimeout(() => void tick(), next);
  }
}

export function startNetworkCollector(): void {
  const s = getState();
  if (s.started) return;
  s.started = true;
  console.log("[network-collector] starter — adaptive 10s aktiv / 60s idle");
  void tick();
}

export function stopNetworkCollector(): void {
  const s = getState();
  s.started = false;
  if (s.timer) {
    clearTimeout(s.timer);
    s.timer = null;
  }
}
