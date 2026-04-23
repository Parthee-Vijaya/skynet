import { NextResponse } from "next/server";
import { getOrRefresh } from "@/lib/cache";
import { collect } from "@/lib/collectors/github";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // GitHub REST ufiltreret = 60/t. Cacher 10 min → 6 kald/t.
    const data = await getOrRefresh("github", 10 * 60_000, collect);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
