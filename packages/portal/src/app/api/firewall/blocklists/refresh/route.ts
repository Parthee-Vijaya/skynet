import { NextResponse, type NextRequest } from "next/server";
import { refreshAll, refreshSource } from "@/lib/firewall/blocklists";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    let sourceId: string | undefined;
    try {
      const body = (await req.json()) as { sourceId?: string };
      sourceId = body.sourceId;
    } catch { /* no body — refresh all */ }

    if (sourceId) {
      const result = await refreshSource(sourceId);
      return NextResponse.json(result);
    }
    const results = await refreshAll();
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
