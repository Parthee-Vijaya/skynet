import { NextResponse } from "next/server";
import { readSeries } from "@/lib/history";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["cpu", "mem", "disk", "netIn", "netOut", "temp"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ metric: string }> }
) {
  const { metric } = await params;
  if (!ALLOWED.has(metric)) {
    return NextResponse.json({ error: "unknown metric" }, { status: 400 });
  }
  const points = readSeries(metric);
  return NextResponse.json({ metric, points });
}
