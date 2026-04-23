import { NextRequest } from "next/server";
import {
  getNotifyConfig,
  setNotifyConfig,
  type NotifyConfig,
} from "@/lib/settings";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getNotifyConfig();
  // Returner ikke fulde tokens/keys — kun om de er sat
  return Response.json({
    macos: cfg.macos,
    ntfyTopic: cfg.ntfyTopic,
    ntfyServer: cfg.ntfyServer,
    pushoverConfigured: !!(cfg.pushoverUser && cfg.pushoverToken),
  });
}

export async function PATCH(req: NextRequest) {
  let body: Partial<NotifyConfig>;
  try {
    body = (await req.json()) as Partial<NotifyConfig>;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  setNotifyConfig(body);
  return Response.json({ ok: true });
}

export async function POST() {
  // Test-notifikation
  const results = await notify({
    title: "Skynet test",
    body: "Hvis du ser dette virker notify-laget 🎉",
    priority: "default",
    tag: "white_check_mark",
  });
  return Response.json({ results });
}
