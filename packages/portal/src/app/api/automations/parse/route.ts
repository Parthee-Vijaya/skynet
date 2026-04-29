/**
 * /api/automations/parse — naturligt sprog → forslag til automation.
 *
 * Tager fri tekst (fx "Send mig et push når disken er over 90%") og kalder
 * den lokale LLM (LM Studio) med en streng JSON-skabelon. Returnerer et
 * forslag som UI'et kan vise i editoren og lade brugeren bekræfte/redigere
 * før det gemmes.
 *
 * Modellen skal IKKE oprette automationen direkte — kun foreslå JSON.
 * Det gør at brugeren altid har sidste ord.
 */

import { NextRequest } from "next/server";
import { getLLMConfig, getImessageDefault } from "@/lib/settings";
import type { Action, Trigger } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ParseSuggestion {
  name: string;
  description?: string;
  trigger: Trigger;
  actions: Action[];
  enabled?: boolean;
}

interface ParseResponse {
  ok: boolean;
  suggestion?: ParseSuggestion;
  error?: string;
  /** LLM's rå output — til debug i UI hvis parse fejler */
  raw?: string;
}

const SYSTEM = `Du er en assistant der oversætter brugerens fri tekst til en JSON-automation til Skynet.
Du SKAL svare med kun JSON (intet markdown, ingen forklaring) i nedenstående format.

Format:
{
  "name": "kort navn (max 50 tegn)",
  "description": "kort dansk forklaring",
  "trigger": <ét af følgende>,
  "actions": [<én eller flere actions>],
  "enabled": true
}

Triggers:
- { "type": "cron", "expression": "0 7 * * *" }   — standard 5-felts cron, fx "0 7 * * *" for kl 07:00
- { "type": "threshold", "metric": "disk_percent" | "cpu" | "mem" | "temperature" | "energy_price" | "netIn" | "netOut", "op": ">" | ">=" | "<" | "<=" | "==", "value": <number>, "cooldownSec": 3600 }
- { "type": "once", "runAt": <ms-since-epoch>, "deleteAfterRun": true }   — engangs på eksakt tidspunkt
- { "type": "manual" }   — kun "kør"-knap

Actions:
- { "type": "notify", "title": "...", "body": "...", "priority": "default" }
- { "type": "llm_notify", "notifyTitle": "...", "prompt": "...", "useTools": true, "imessageTo": "+45..." (valgfri) }
- { "type": "tool", "tool": "<tool-navn>", "args": {...} }

Tools du kan bruge i tool-actions:
- read_weather, read_energy, read_system_status, read_disk
- fetch_news (args: url, limit)
- web_fetch (args: url), web_search (args: query)
- send_imessage (args: to, message)
- list_calendar_events
- list_reminders, add_reminder

Regler:
- Brug llm_notify når brugeren beder om "skriv en briefing", "AI genererer", eller hvis output ikke er forudbestemt
- Brug threshold-trigger når brugeren nævner "når X er over/under Y"
- Brug cron-trigger når brugeren nævner et tidspunkt
- Brug once-trigger når brugeren beder om eksakt engangs-tidspunkt
- Hvis en handling kræver iMessage og brugeren har en default-modtager: brug den
- Output PRÆCIS det JSON-format ovenfor — intet andet`;

export async function POST(req: NextRequest) {
  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" } satisfies ParseResponse, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) {
    return Response.json({ ok: false, error: "text er påkrævet" } satisfies ParseResponse, { status: 400 });
  }

  const { baseUrl, apiKey, defaultModel } = getLLMConfig();
  const imessageDefault = getImessageDefault();
  const now = new Date();
  const userPrompt = [
    `Brugerens ønske: ${text}`,
    "",
    `Nuværende tid (DK): ${now.toLocaleString("da-DK")} (${now.toISOString()})`,
    imessageDefault ? `Brugerens iMessage-default: ${imessageDefault}` : `Bemærk: ingen iMessage-default sat`,
    "",
    "Returnér KUN det JSON-format der er beskrevet i system-prompten. Intet andet.",
  ].join("\n");

  // Pick model: default fra settings, ellers første tilgængelige
  let model = defaultModel;
  if (!model) {
    try {
      const r = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) {
        const d = (await r.json()) as { data?: Array<{ id: string }> };
        model = d.data?.[0]?.id ?? "";
      }
    } catch { /* noop */ }
  }
  if (!model) {
    return Response.json({ ok: false, error: "ingen LLM-model tilgængelig — start LM Studio eller sæt llm_default_model" } satisfies ParseResponse, { status: 503 });
  }

  let raw = "";
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return Response.json({ ok: false, error: `LLM HTTP ${res.status}: ${t.slice(0, 200)}` } satisfies ParseResponse, { status: 502 });
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "LLM-kald fejlede" } satisfies ParseResponse, { status: 502 });
  }

  // Strip evt. markdown-fence
  const cleaned = stripFence(raw);
  let suggestion: ParseSuggestion;
  try {
    suggestion = JSON.parse(cleaned) as ParseSuggestion;
  } catch (e) {
    return Response.json({
      ok: false,
      error: `LLM returnerede ikke gyldig JSON: ${e instanceof Error ? e.message : "parse fejl"}`,
      raw,
    } satisfies ParseResponse, { status: 422 });
  }

  // Minimal validering
  if (!suggestion.name || !suggestion.trigger || !Array.isArray(suggestion.actions) || suggestion.actions.length === 0) {
    return Response.json({ ok: false, error: "LLM-output mangler name/trigger/actions", raw } satisfies ParseResponse, { status: 422 });
  }

  return Response.json({ ok: true, suggestion } satisfies ParseResponse);
}

function stripFence(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return t;
}
