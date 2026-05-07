import { NextResponse, type NextRequest } from "next/server";
import { deleteProfile, updateProfile } from "@/lib/firewall/profiles";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
    const body = (await req.json()) as Record<string, unknown>;
    updateProfile(n, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
    deleteProfile(n);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
