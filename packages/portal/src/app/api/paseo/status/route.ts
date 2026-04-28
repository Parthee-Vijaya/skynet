/**
 * /api/paseo/status — wraps `paseo daemon status --json` så Skynet portal
 * kan vise om Paseo daemon kører, hvor mange agents osv.
 */
import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

export interface PaseoStatus {
  online: boolean;
  serverId?: string;
  listen?: string;
  hostname?: string;
  pid?: number;
  startedAt?: string;
  runningAgents?: number;
  idleAgents?: number;
  daemonVersion?: string;
  error?: string;
}

export async function GET() {
  try {
    const { stdout } = await execAsync("/opt/homebrew/bin/paseo daemon status --json", { timeout: 4000 });
    const d = JSON.parse(stdout) as Record<string, unknown>;
    const online = d.localDaemon === "running";
    return NextResponse.json({
      online,
      serverId: d.serverId,
      listen: d.listen,
      hostname: d.hostname,
      pid: d.pid,
      startedAt: d.startedAt,
      runningAgents: d.runningAgents,
      idleAgents: d.idleAgents,
      daemonVersion: d.daemonVersion ?? d.cliVersion,
    } as PaseoStatus);
  } catch (e) {
    return NextResponse.json({
      online: false,
      error: e instanceof Error ? e.message : "paseo daemon not reachable",
    } as PaseoStatus);
  }
}
