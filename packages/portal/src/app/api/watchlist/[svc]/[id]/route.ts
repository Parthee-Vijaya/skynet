import { NextRequest, NextResponse } from "next/server";
import * as sonarr from "@/lib/collectors/sonarr";
import * as radarr from "@/lib/collectors/radarr";
import { invalidate } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ svc: string; id: string }>;
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { svc, id } = await params;
  const numericId = parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  const deleteFiles = new URL(req.url).searchParams.get("deleteFiles") === "1";

  let ok = false;
  if (svc === "sonarr") ok = await sonarr.deleteSeries(numericId, deleteFiles);
  else if (svc === "radarr") ok = await radarr.deleteMovie(numericId, deleteFiles);
  else return NextResponse.json({ ok: false, error: "Ukendt service" }, { status: 400 });

  if (ok) invalidate("watchlist");
  return NextResponse.json({ ok });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { svc, id } = await params;
  const numericId = parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  let body: { monitored?: boolean };
  try {
    body = (await req.json()) as { monitored?: boolean };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.monitored !== "boolean") {
    return NextResponse.json({ ok: false, error: "Mangler monitored" }, { status: 400 });
  }

  let ok = false;
  if (svc === "sonarr") ok = await sonarr.setMonitored(numericId, body.monitored);
  else if (svc === "radarr") ok = await radarr.setMonitored(numericId, body.monitored);
  else return NextResponse.json({ ok: false, error: "Ukendt service" }, { status: 400 });

  if (ok) invalidate("watchlist");
  return NextResponse.json({ ok });
}
