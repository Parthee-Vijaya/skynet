import { NextRequest } from "next/server";
import { getLLMConfig, setLLMConfig, DEFAULT_LLM_CONFIG, LLMConfig } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const llm = getLLMConfig();
  return Response.json({ llm, defaults: DEFAULT_LLM_CONFIG });
}

export async function POST(req: NextRequest) {
  let body: { llm?: Partial<LLMConfig> };
  try {
    body = (await req.json()) as { llm?: Partial<LLMConfig> };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (body.llm) setLLMConfig(body.llm);
  return Response.json({ ok: true, llm: getLLMConfig() });
}
