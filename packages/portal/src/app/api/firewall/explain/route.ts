import { NextResponse, type NextRequest } from "next/server";
import { explainConnection } from "@/lib/firewall/explain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { host?: string; app?: string };
    if (!body.host) {
      return NextResponse.json({ error: "host er påkrævet" }, { status: 400 });
    }
    const result = await explainConnection(body.host, body.app);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
