import { NextResponse } from "next/server";
import { getOrRefresh } from "@/lib/cache";
import { collect } from "@/lib/collectors/devices";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getOrRefresh("devices", 45_000, collect);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
