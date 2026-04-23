import { NextResponse } from "next/server";
import { getOrRefresh } from "@/lib/cache";
import { collect } from "@/lib/collectors/discover";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Cache i 20 min — sliden roterer client-side hvert minut.
    const data = await getOrRefresh("discover", 20 * 60_000, collect);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
