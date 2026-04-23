import { NextResponse } from "next/server";
import { DAEMON_BASE_URL } from "@/lib/daemon-config";

/**
 * GET /api/daemon — proxy to daemon status endpoint.
 * Returns daemon info or { online: false } if daemon is unreachable.
 */
export async function GET() {
  try {
    const res = await fetch(`${DAEMON_BASE_URL}/api/status`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    return NextResponse.json({ online: true, ...data });
  } catch {
    return NextResponse.json({ online: false });
  }
}
