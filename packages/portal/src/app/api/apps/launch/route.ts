import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAppById } from "@/lib/apps.server";

const execFileAsync = promisify(execFile);

/**
 * Launcher for native Mac apps i app-registry.
 *
 * `POST /api/apps/launch?id=saga` → kører `open -a Saga`.
 *
 * Whitelist: kun apps med `kind: "native-mac"` og en `appName` accepteres.
 * Brugerinput er begrænset til `id`, og `appName` kommer altid fra
 * registry — så ingen risiko for shell-injection.
 */
export async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const app = getAppById(id);
  if (!app) {
    return NextResponse.json({ error: `unknown app: ${id}` }, { status: 404 });
  }
  if (app.kind !== "native-mac" || !app.appName) {
    return NextResponse.json(
      { error: `app '${id}' is not a native-mac app` },
      { status: 400 }
    );
  }

  try {
    await execFileAsync("/usr/bin/open", ["-a", app.appName]);
    return NextResponse.json({ ok: true, launched: app.appName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
