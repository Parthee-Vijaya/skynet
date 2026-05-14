import { NextResponse, type NextRequest } from "next/server";
import { createProfile, getActiveProfile, listProfiles, currentSsid } from "@/lib/firewall/profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profiles = listProfiles();
    const active = getActiveProfile();
    const ssid = await currentSsid();
    return NextResponse.json({
      profiles,
      activeId: active?.id ?? null,
      currentSsid: ssid,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}

interface PostBody {
  name: string;
  description?: string;
  ssid_pattern?: string;
  trust_level?: "high" | "normal" | "low";
  llm_summary?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PostBody;
    if (!body.name) return NextResponse.json({ error: "name er påkrævet" }, { status: 400 });
    const id = createProfile({
      name: body.name,
      description: body.description ?? null,
      ssid_pattern: body.ssid_pattern ?? null,
      trust_level: body.trust_level ?? "normal",
      llm_summary: body.llm_summary ?? null,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
