/**
 * Gmail mail-triage — henter ulæste mails, beder LLM'en klassificere dem,
 * og opsummerer dem der kræver handling.
 *
 * Output: en dansk kort tekst som kan sendes som notifikation.
 */

import { fetchRecentUnread, type MailSummary } from "@/lib/integrations/gmail";
import { getLLMConfig } from "@/lib/settings";

export interface TriageResult {
  ok: boolean;
  message: string;
  /** Generated summary text (dansk) */
  summary?: string;
  /** Klassificerede mails med label */
  classified?: Array<MailSummary & { label: string; reason?: string }>;
  /** Antal der kræver handling */
  actionRequired?: number;
}

const CLASSIFY_PROMPT = `Du klassificerer emails på dansk. For hver mail, returnér et JSON-array hvor hvert element har:
- "uid": mailens uid (int)
- "label": en af ["vigtig", "handling", "nyhedsbrev", "reklame", "personlig", "andet"]
- "reason": 1 kort sætning hvorfor (max 15 ord, dansk)

VIGTIGT: Returnér KUN JSON-arrayet, intet andet. Ingen markdown, ingen forklaring.

Mails:
{data}

JSON:`;

const SUMMARY_PROMPT = `Du er Skynet. Skriv en meget kort dansk opsummering (max 3 linjer) af de mails der kræver handling.
Fokusér kun på de vigtige — ikke reklamer eller nyhedsbreve.
Ingen markdown, ingen emojis.

Mails der kræver handling:
{data}

Skriv opsummeringen:`;

export async function runTriage(limit = 20, model?: string): Promise<TriageResult> {
  const mails = await fetchRecentUnread(limit);
  if (mails.length === 0) {
    return { ok: true, message: "ingen ulæste mails", actionRequired: 0 };
  }

  const { baseUrl, apiKey, defaultModel } = getLLMConfig();
  const chosenModel = model || defaultModel || (await pickFirstModel(baseUrl, apiKey));
  if (!chosenModel) {
    return { ok: false, message: "ingen LM Studio-model tilgængelig" };
  }

  // ── Klassificer ──────────────────────────────────────────────────────
  const dataForClassify = mails
    .map(
      (m) =>
        `[${m.uid}] fra: ${m.from} <${m.fromEmail}> | emne: ${m.subject} | snippet: ${m.snippet}`
    )
    .join("\n");

  const classifyRes = await callLLM(
    baseUrl,
    apiKey,
    chosenModel,
    CLASSIFY_PROMPT.replace("{data}", dataForClassify)
  );
  if (!classifyRes) {
    return { ok: false, message: "klassificering fejlede" };
  }

  // Parse JSON-array (LLM'en kan omvikle det i kodeblokke — ryd op)
  let parsed: Array<{ uid: number; label: string; reason?: string }> = [];
  try {
    const cleaned = classifyRes
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const arr = JSON.parse(cleaned);
    if (Array.isArray(arr)) parsed = arr;
  } catch {
    return { ok: false, message: "kunne ikke parse LLM JSON-respons" };
  }

  const classified = mails.map((m) => {
    const match = parsed.find((p) => Number(p.uid) === m.uid);
    return {
      ...m,
      label: match?.label || "andet",
      reason: match?.reason,
    };
  });

  const actionRequired = classified.filter(
    (c) => c.label === "vigtig" || c.label === "handling"
  );

  if (actionRequired.length === 0) {
    return {
      ok: true,
      message: `${mails.length} mails triaged · 0 kræver handling`,
      classified,
      actionRequired: 0,
    };
  }

  // ── Opsummér ─────────────────────────────────────────────────────────
  const dataForSummary = actionRequired
    .map(
      (m) =>
        `- Fra ${m.from}: "${m.subject}" — ${m.reason || m.snippet.slice(0, 80)}`
    )
    .join("\n");

  const summary = await callLLM(
    baseUrl,
    apiKey,
    chosenModel,
    SUMMARY_PROMPT.replace("{data}", dataForSummary)
  );

  return {
    ok: true,
    message: `${mails.length} mails · ${actionRequired.length} kræver handling`,
    summary: summary?.trim() || undefined,
    classified,
    actionRequired: actionRequired.length,
  };
}

async function callLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

async function pickFirstModel(baseUrl: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}
