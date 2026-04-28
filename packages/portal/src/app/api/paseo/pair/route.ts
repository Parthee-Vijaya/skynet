/**
 * /api/paseo/pair — wraps `paseo daemon pair --json` så Skynet kan embede
 * Paseo's web app (https://app.paseo.sh/#offer=...) pre-paret med lokal daemon.
 *
 * Pair-URL'en indeholder serverId + daemonens public key + relay-endpoint.
 * Den er sikker at vise i browseren — den routes via Paseo's relay-server
 * (relay.paseo.sh) hvor kun ejeren af daemon-keypair kan dekrypte beskeder.
 *
 * Cache: 60s. URL'en er stabil over daemon-restart hvis serverId ikke ændres.
 */
import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getOrRefresh } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

export interface PaseoPair {
  url?: string;
  relayEnabled?: boolean;
  error?: string;
}

async function fetchPair(): Promise<PaseoPair> {
  try {
    const { stdout } = await execAsync("/opt/homebrew/bin/paseo daemon pair --json", { timeout: 5000 });
    const d = JSON.parse(stdout) as { url?: string; relayEnabled?: boolean };
    return { url: d.url, relayEnabled: d.relayEnabled };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "paseo not running" };
  }
}

export async function GET() {
  const data = await getOrRefresh<PaseoPair>("paseo-pair", 60_000, fetchPair);
  return NextResponse.json(data);
}
