import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/control/auth";
import { listServices } from "@/lib/control/services";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;

  try {
    const services = await listServices();
    return NextResponse.json({ services }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
