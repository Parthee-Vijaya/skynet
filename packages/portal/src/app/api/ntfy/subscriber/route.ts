/**
 * GET   /api/ntfy/subscriber — status + public URL + ntfy topic info
 * PATCH /api/ntfy/subscriber — { enabled?: bool, publicUrl?: string }
 */

import { NextRequest } from "next/server";
import {
  isSubscriberEnabled,
  setSubscriberEnabled,
  startSubscriber,
} from "@/jobs/ntfy-subscriber";
import {
  getNotifyConfig,
  getSkynetPublicUrl,
  setSkynetPublicUrl,
  getSetting,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StatusResponse {
  enabled: boolean;
  ntfyTopic: string;
  ntfyServer: string;
  publicUrl: string;
  lastFinishedSessionId?: string;
  lastFinishedSessionAt?: string;
}

function buildStatus(): StatusResponse {
  const cfg = getNotifyConfig();
  const at = getSetting("last_finished_session_at");
  return {
    enabled: isSubscriberEnabled(),
    ntfyTopic: cfg.ntfyTopic,
    ntfyServer: cfg.ntfyServer,
    publicUrl: getSkynetPublicUrl(),
    lastFinishedSessionId: getSetting("last_finished_session_id"),
    lastFinishedSessionAt: at ? new Date(parseInt(at, 10)).toISOString() : undefined,
  };
}

export async function GET(): Promise<Response> {
  return Response.json(buildStatus());
}

export async function PATCH(req: NextRequest): Promise<Response> {
  let body: { enabled?: boolean; publicUrl?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.publicUrl === "string") {
    setSkynetPublicUrl(body.publicUrl);
  }
  if (typeof body.enabled === "boolean") {
    setSubscriberEnabled(body.enabled);
    if (body.enabled) {
      try { startSubscriber(); } catch { /* noop */ }
    }
  }
  return Response.json(buildStatus());
}
