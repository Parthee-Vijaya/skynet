import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/control/auth";
import { controlService, type ServiceAction } from "@/lib/control/services";
import { isServiceAllowed } from "@/lib/control/allowlist";

export const dynamic = "force-dynamic";

const VALID_ACTIONS: ServiceAction[] = ["start", "stop", "restart", "status"];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ label: string }> }
) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;

  const { label } = await ctx.params;
  const decodedLabel = decodeURIComponent(label);

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const action = body.action as ServiceAction;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const allowed = isServiceAllowed(decodedLabel, action);
  if (!allowed) {
    return NextResponse.json(
      { error: `service '${decodedLabel}' or action '${action}' not allowed` },
      { status: 403 }
    );
  }

  // Irreversible actions kræver X-Confirm: true header
  if (action === "stop" || action === "restart") {
    const confirm = req.headers.get("x-confirm");
    if (confirm !== "true") {
      return NextResponse.json(
        { error: "destructive action requires X-Confirm: true header" },
        { status: 428 }
      );
    }
  }

  const result = await controlService(decodedLabel, action);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
    headers: { "cache-control": "no-store" },
  });
}
