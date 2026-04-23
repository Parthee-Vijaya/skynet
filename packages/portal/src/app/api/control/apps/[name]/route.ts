import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/control/auth";
import { controlApp, type AppAction } from "@/lib/control/apps";
import { isAppAllowed } from "@/lib/control/allowlist";

export const dynamic = "force-dynamic";

const VALID_ACTIONS: AppAction[] = ["launch", "quit", "focus"];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ name: string }> }
) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;

  const { name } = await ctx.params;
  const decoded = decodeURIComponent(name);

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const action = body.action as AppAction;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const entry = isAppAllowed(decoded);
  if (!entry) {
    return NextResponse.json(
      { error: `app '${decoded}' not allowed` },
      { status: 403 }
    );
  }

  if (action === "quit") {
    const confirm = req.headers.get("x-confirm");
    if (confirm !== "true") {
      return NextResponse.json(
        { error: "quit requires X-Confirm: true header" },
        { status: 428 }
      );
    }
  }

  const result = await controlApp(decoded, action);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
    headers: { "cache-control": "no-store" },
  });
}
