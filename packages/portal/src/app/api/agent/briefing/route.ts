import { NextRequest } from "next/server";
import { runBriefing, type BriefingType } from "@/lib/agent/briefings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") as BriefingType) || "morning";
  if (type !== "morning" && type !== "evening") {
    return Response.json({ error: "type skal være morning eller evening" }, { status: 400 });
  }
  const model = searchParams.get("model") || undefined;
  const result = await runBriefing(type, model);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
