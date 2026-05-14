import { NextResponse, type NextRequest } from "next/server";
import { getFirewallAlertsStatus } from "@/jobs/firewall-alerts";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ...getFirewallAlertsStatus(),
    enabled: getSetting("firewall_alerts_enabled") === "1",
    threshold: Number(getSetting("firewall_alert_threshold") ?? "70"),
  });
}

interface PatchBody {
  enabled?: boolean;
  threshold?: number;
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as PatchBody;
    if (typeof body.enabled === "boolean") {
      setSetting("firewall_alerts_enabled", body.enabled ? "1" : "0");
    }
    if (typeof body.threshold === "number" && body.threshold >= 1 && body.threshold <= 100) {
      setSetting("firewall_alert_threshold", String(Math.round(body.threshold)));
    }
    return NextResponse.json({
      ok: true,
      enabled: getSetting("firewall_alerts_enabled") === "1",
      threshold: Number(getSetting("firewall_alert_threshold") ?? "70"),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
