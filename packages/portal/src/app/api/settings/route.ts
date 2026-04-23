import { NextRequest } from "next/server";
import { getLLMConfig, setLLMConfig, DEFAULT_LLM_CONFIG, LLMConfig, getUserName, setUserName } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const llm = getLLMConfig();
  const userName = getUserName();
  return Response.json({ llm, defaults: DEFAULT_LLM_CONFIG, userName });
}

export async function POST(req: NextRequest) {
  let body: { llm?: Partial<LLMConfig>; userName?: string };
  try {
    body = (await req.json()) as { llm?: Partial<LLMConfig>; userName?: string };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (body.llm) setLLMConfig(body.llm);
  if (typeof body.userName === "string") setUserName(body.userName);
  return Response.json({ ok: true, llm: getLLMConfig(), userName: getUserName() });
}
