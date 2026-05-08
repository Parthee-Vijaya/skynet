import { NextResponse, type NextRequest } from "next/server";
import { invalidate } from "@/lib/cache";
import { deleteRule as deleteLuluRule, reloadLulu } from "@/lib/firewall/lulu";
import { deleteRuleRow, getRule, updateRule } from "@/lib/firewall/store";

export const dynamic = "force-dynamic";

interface PatchBody {
  description?: string;
  llm_explanation?: string;
  profile_id?: number | null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
    const body = (await req.json()) as PatchBody;
    updateRule(n, body);
    invalidate("firewall_rules");
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
    const row = getRule(n);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

    // If it's a lulu-mirror rule, also delete from LuLu (best-effort).
    if (row.source === "lulu") {
      try {
        const uuid = row.description?.startsWith("lulu:") ? row.description.slice(5) : undefined;
        await deleteLuluRule(row.lulu_key, uuid);
        await reloadLulu();
      } catch (e) {
        // Surface to caller — partial state (DB row remains until they confirm)
        return NextResponse.json(
          {
            ok: false,
            error: `Kunne ikke slette i LuLu: ${e instanceof Error ? e.message : String(e)}. Skynet-mirror er IKKE slettet.`,
          },
          { status: 502 }
        );
      }
    }

    deleteRuleRow(n);
    invalidate("firewall_rules");
    invalidate("firewall_lulu_status");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
