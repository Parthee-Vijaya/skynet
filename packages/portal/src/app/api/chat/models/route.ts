import { getLLMConfig } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Forventede LM Studio-model-IDs — kun relevante når brugeren kører lokalt.
 * Gemini og andre cloud-providers har deres egne model-IDs (gemini-2.5-flash
 * etc) og vises uden 'missing'-hints.
 */
const EXPECTED_LMSTUDIO = [
  { hint: "munin", label: "munin-7b-alpha", tag: "dansk" },
  { hint: "mistral-small", label: "Mistral Small 3.2 24B", tag: "balance" },
  { hint: "gpt-oss", label: "gpt-oss-20b", tag: "hurtig" },
] as const;

function isLocalProvider(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1?\])/i.test(baseUrl);
}

function detectProvider(baseUrl: string): string {
  if (isLocalProvider(baseUrl)) return "LM Studio";
  if (baseUrl.includes("generativelanguage.googleapis.com")) return "Google Gemini";
  if (baseUrl.includes("openai.com")) return "OpenAI";
  if (baseUrl.includes("anthropic.com")) return "Anthropic";
  return "Custom";
}

function matchExpected(id: string) {
  const lower = id.toLowerCase();
  for (const e of EXPECTED_LMSTUDIO) {
    if (lower.includes(e.hint)) return { label: e.label, tag: e.tag };
  }
  return null;
}

export async function GET() {
  const { baseUrl, apiKey } = getLLMConfig();
  const provider = detectProvider(baseUrl);
  const local = isLocalProvider(baseUrl);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        Accept: "application/json",
        // Cloud-providers (Gemini/OpenAI/Anthropic) kræver Bearer auth.
        // LM Studio ignorerer header, så ingen skade ved at sende den altid.
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ""}`);
    }
    const data = (await res.json()) as { data?: Array<{ id: string; owned_by?: string }> };
    const models = (data.data ?? []).map((m) => {
      // Kun match LM Studio-hints lokalt — irrelevant for Gemini etc
      const match = local ? matchExpected(m.id) : null;
      return {
        id: m.id,
        owned_by: m.owned_by,
        ...(match ? { label: match.label, tag: match.tag } : {}),
      };
    });
    const missing = local
      ? EXPECTED_LMSTUDIO.filter(
          (e) => !models.some((m) => m.id.toLowerCase().includes(e.hint))
        ).map((e) => ({ hint: e.hint, label: e.label, tag: e.tag }))
      : [];
    return Response.json({ available: true, provider, baseUrl, models, missing });
  } catch (e) {
    return Response.json({
      available: false,
      provider,
      baseUrl,
      models: [],
      missing: local ? EXPECTED_LMSTUDIO.map((e) => ({ hint: e.hint, label: e.label, tag: e.tag })) : [],
      error: e instanceof Error ? e.message : "unknown",
    });
  }
}
