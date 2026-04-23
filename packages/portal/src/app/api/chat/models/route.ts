import { getLLMConfig } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Forventede model-IDs (ca.) — bruges til at markere "anbefalede" i UI'et.
 * LM Studio returnerer præcist hvad der er loaded, så disse er kun hints.
 */
const EXPECTED = [
  { hint: "munin", label: "munin-7b-alpha", tag: "dansk" },
  { hint: "mistral-small", label: "Mistral Small 3.2 24B", tag: "balance" },
  { hint: "gpt-oss", label: "gpt-oss-20b", tag: "hurtig" },
] as const;

function matchExpected(id: string) {
  const lower = id.toLowerCase();
  for (const e of EXPECTED) {
    if (lower.includes(e.hint)) return { label: e.label, tag: e.tag };
  }
  return null;
}

export async function GET() {
  const { baseUrl } = getLLMConfig();
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id: string; owned_by?: string }> };
    const models = (data.data ?? []).map((m) => {
      const match = matchExpected(m.id);
      return {
        id: m.id,
        owned_by: m.owned_by,
        ...(match ? { label: match.label, tag: match.tag } : {}),
      };
    });
    // Hvilke af de forventede modeller mangler?
    const missing = EXPECTED.filter(
      (e) => !models.some((m) => m.id.toLowerCase().includes(e.hint))
    ).map((e) => ({ hint: e.hint, label: e.label, tag: e.tag }));
    return Response.json({ available: true, baseUrl, models, missing });
  } catch (e) {
    return Response.json({
      available: false,
      baseUrl,
      models: [],
      missing: EXPECTED.map((e) => ({ hint: e.hint, label: e.label, tag: e.tag })),
      error: e instanceof Error ? e.message : "unknown",
    });
  }
}
