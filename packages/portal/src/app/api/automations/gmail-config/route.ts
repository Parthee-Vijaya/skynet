import { NextRequest } from "next/server";
import {
  getGmailConfig,
  setGmailConfig,
  type GmailConfig,
} from "@/lib/settings";
import { testConnection } from "@/lib/integrations/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getGmailConfig();
  // Returner ikke det fulde app-password — kun om det er sat
  return Response.json({
    enabled: cfg.enabled,
    user: cfg.user,
    hasPassword: !!cfg.appPassword,
    pollMinutes: cfg.pollMinutes,
    notifyOnTriage: cfg.notifyOnTriage,
  });
}

export async function PATCH(req: NextRequest) {
  let body: Partial<GmailConfig>;
  try {
    body = (await req.json()) as Partial<GmailConfig>;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  setGmailConfig(body);
  return Response.json({ ok: true });
}

export async function POST() {
  // Test-forbindelse
  const result = await testConnection();
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
