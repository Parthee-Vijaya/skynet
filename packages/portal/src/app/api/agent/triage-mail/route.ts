import { NextRequest } from "next/server";
import { runTriage } from "@/lib/agent/mail-triage";
import { notify } from "@/lib/notify";
import { getGmailConfig } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitStr = searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : 20;
  const model = searchParams.get("model") || undefined;
  const push = searchParams.get("push") === "1";

  const cfg = getGmailConfig();
  if (!cfg.user || !cfg.appPassword) {
    return Response.json(
      { ok: false, message: "Gmail er ikke konfigureret — gå til /settings" },
      { status: 400 }
    );
  }

  try {
    const result = await runTriage(limit, model);

    if (push && result.ok && result.summary && (result.actionRequired ?? 0) > 0) {
      await notify({
        title: `📧 ${result.actionRequired} mails kræver svar`,
        body: result.summary,
        priority: "default",
        tag: "mail-triage",
      });
    }

    return Response.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    return Response.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
