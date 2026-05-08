import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface NettopBytes {
  pid: number;
  process: string;
  bytesIn: number;   // cumulative siden boot
  bytesOut: number;
}

/**
 * Run `nettop -P -L 1 -x` for one snapshot of cumulative byte counts pr. process.
 * Output is CSV. Header looks like:
 *   time,,interface,state,bytes_in,bytes_out,...
 * Data rows:
 *   23:18:19.930143,launchd.1,,,0,0,...
 *   23:18:19.930149,nesessionmanage.380,,,0,0,...
 *
 * `-P` per-process roll-up, `-L 1` single sample (CSV mode), `-x` raw bytes (no MiB).
 * The process column is index 1 (after the timestamp). bytes_in/out are located by
 * header-name lookup since their position varies with kernel version.
 */
export async function runNettop(timeoutMs = 8000): Promise<NettopBytes[]> {
  // `-L 1` is supposed to be a single-sample logging mode but in practice nettop
  // takes 1-4 seconds to settle even for one sample on macOS 14/15. We pipe
  // /dev/null on stdin so it doesn't try to read from launchd's tty.
  const { stdout } = await execAsync(
    "/usr/bin/nettop -P -L 1 -x < /dev/null",
    { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }
  );
  return parseNettopOutput(stdout);
}

const PROCESS_COL = 1; // nettop -P -L 1 always emits time then process.pid

export function parseNettopOutput(stdout: string): NettopBytes[] {
  const out: NettopBytes[] = [];
  const lines = stdout.split("\n");
  let headerSeen = false;
  let colIn = -1, colOut = -1;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(",");
    if (!headerSeen) {
      colIn = cols.findIndex((c) => c.toLowerCase() === "bytes_in");
      colOut = cols.findIndex((c) => c.toLowerCase() === "bytes_out");
      headerSeen = true;
      if (colIn === -1 || colOut === -1) {
        // Header didn't match expected — bail; collector will fall back to no byte data.
        return [];
      }
      continue;
    }
    if (cols.length <= Math.max(PROCESS_COL, colIn, colOut)) continue;

    // Process column is "Spotify.123" (name.pid). Skip rows without a valid pid.
    const procField = cols[PROCESS_COL];
    const pidMatch = procField.match(/^(.+)\.(\d+)$/);
    if (!pidMatch) continue;
    const name = pidMatch[1];
    const pid = Number(pidMatch[2]);
    const bytesIn = Number(cols[colIn]);
    const bytesOut = Number(cols[colOut]);

    if (!Number.isFinite(pid) || !Number.isFinite(bytesIn) || !Number.isFinite(bytesOut)) continue;
    out.push({ pid, process: name, bytesIn, bytesOut });
  }

  return out;
}

/** Track previous snapshot per pid to compute deltas between ticks. */
export class NettopDelta {
  private prev = new Map<number, { bytesIn: number; bytesOut: number }>();

  /** Returns delta (in/out) for a given pid since last call, or 0/0 if first time. */
  delta(pid: number, current: NettopBytes): { in: number; out: number } {
    const last = this.prev.get(pid);
    this.prev.set(pid, { bytesIn: current.bytesIn, bytesOut: current.bytesOut });
    if (!last) return { in: 0, out: 0 };
    // Process restart resets counters → negative delta; clamp to 0.
    return {
      in: Math.max(0, current.bytesIn - last.bytesIn),
      out: Math.max(0, current.bytesOut - last.bytesOut),
    };
  }

  /** Drop entries for pids no longer seen — call after each tick. */
  prune(seenPids: Set<number>): void {
    for (const pid of this.prev.keys()) {
      if (!seenPids.has(pid)) this.prev.delete(pid);
    }
  }
}
