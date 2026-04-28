/**
 * GET  /api/automations/imessage-poller — status (enabled, lastSeen)
 * PATCH /api/automations/imessage-poller — { enabled: bool } toggle
 */

import { NextRequest } from "next/server";
import { isPollerEnabled, setPollerEnabled } from "@/jobs/imessage-poller";
import { getSetting } from "@/lib/settings";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_DB = `${homedir()}/Library/Messages/chat.db`;

interface StatusResponse {
  enabled: boolean;
  chatDbExists: boolean;
  lastSeenRowid?: number;
  /** True hvis vi har kunnet læse chat.db mindst én gang (så FDA er ok) */
  fdaOk: boolean;
}

export async function GET(): Promise<Response> {
  const enabled = isPollerEnabled();
  const lastSeen = parseInt(getSetting("imessage_poller_last_rowid") ?? "0", 10);
  const chatDbExists = existsSync(CHAT_DB);
  const fdaOk = lastSeen > 0; // hvis vi har læst rowid > 0 én gang er FDA ok
  return Response.json({ enabled, chatDbExists, lastSeenRowid: lastSeen || undefined, fdaOk } satisfies StatusResponse);
}

export async function PATCH(req: NextRequest): Promise<Response> {
  let body: { enabled?: boolean };
  try {
    body = (await req.json()) as { enabled?: boolean };
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "enabled (bool) er påkrævet" }, { status: 400 });
  }
  setPollerEnabled(body.enabled);
  return Response.json({ enabled: isPollerEnabled() });
}
