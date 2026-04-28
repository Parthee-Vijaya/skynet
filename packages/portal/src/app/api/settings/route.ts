import { NextRequest } from "next/server";
import { getLLMConfig, setLLMConfig, DEFAULT_LLM_CONFIG, LLMConfig, getUserName, setUserName, getLocation, getSetting, setSetting, getImessageDefault, setImessageDefault, getRejseplanenAccessId, setRejseplanenAccessId, getNzbgeekApiKey, setNzbgeekApiKey } from "@/lib/settings";
import { geocodeCity } from "@/app/api/setup/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const llm = getLLMConfig();
  const userName = getUserName();
  const location = getLocation();
  const githubUser = getSetting("github_user") ?? "";
  const hasGithubToken = !!getSetting("github_token");
  const imessageDefault = getImessageDefault();
  const hasRejseplanenAccessId = !!getRejseplanenAccessId();
  const hasNzbgeekApiKey = !!getNzbgeekApiKey();
  return Response.json({ llm, defaults: DEFAULT_LLM_CONFIG, userName, location, githubUser, hasGithubToken, imessageDefault, hasRejseplanenAccessId, hasNzbgeekApiKey });
}

export async function POST(req: NextRequest) {
  let body: {
    llm?: Partial<LLMConfig>; userName?: string; city?: string;
    githubUser?: string; githubToken?: string; imessageDefault?: string;
    rejseplanenAccessId?: string; nzbgeekApiKey?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (body.llm) setLLMConfig(body.llm);
  if (typeof body.userName === "string") setUserName(body.userName);
  if (typeof body.githubUser === "string") setSetting("github_user", body.githubUser.trim());
  if (typeof body.githubToken === "string") setSetting("github_token", body.githubToken.trim());
  if (typeof body.imessageDefault === "string") setImessageDefault(body.imessageDefault);
  if (typeof body.rejseplanenAccessId === "string") setRejseplanenAccessId(body.rejseplanenAccessId);
  if (typeof body.nzbgeekApiKey === "string") setNzbgeekApiKey(body.nzbgeekApiKey);
  if (typeof body.city === "string" && body.city.trim()) {
    const { setSettingJSON } = await import("@/lib/settings");
    const loc = await geocodeCity(body.city.trim());
    if (!loc) return Response.json({ ok: false, error: `Kunne ikke finde "${body.city}"` }, { status: 422 });
    setSettingJSON("location", loc);
  }
  return Response.json({
    ok: true,
    llm: getLLMConfig(),
    userName: getUserName(),
    location: getLocation(),
    githubUser: getSetting("github_user") ?? "",
    hasGithubToken: !!getSetting("github_token"),
    imessageDefault: getImessageDefault(),
    hasRejseplanenAccessId: !!getRejseplanenAccessId(),
    hasNzbgeekApiKey: !!getNzbgeekApiKey(),
  });
}
