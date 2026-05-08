import { NextResponse } from "next/server";
import { ensureLoaded, getStatus } from "@/lib/firewall/blocklists";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureLoaded().catch(() => undefined);
  return NextResponse.json(getStatus());
}
