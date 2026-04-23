import { NextResponse } from "next/server";
import { requireAuth, getControlToken, rotateControlToken } from "@/lib/control/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return NextResponse.json({ token: getControlToken() });
}

export async function POST(req: Request) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  const token = rotateControlToken();
  return NextResponse.json({ token });
}
