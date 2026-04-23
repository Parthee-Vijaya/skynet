/**
 * Daily briefing — samler data (vejr, energi, system, services) og lader
 * LLM'en skrive et kort dansk oplæg. Resultatet pushes til alle aktiverede
 * notify-backends.
 *
 * Design: pre-henter data og embedder det i prompten fremfor at bruge tool-
 * calling. Mere pålideligt for korte, deterministiske briefings.
 */

import { collect as collectSystem } from "../collectors/system";
import { collect as collectWeather } from "../collectors/weather";
import { collect as collectEnergy } from "../collectors/energy";
import { collect as collectDisk } from "../collectors/disk";
import { listServices } from "../control/services";
import { notify } from "../notify";
import { getLLMConfig } from "../settings";

export type BriefingType = "morning" | "evening";

export interface BriefingResult {
  ok: boolean;
  message: string;
  text?: string;
}

const TEMPLATE_MORNING = `Du er Skynet. Skriv en kort dansk morgenbriefing — max 4 linjer.
Brug data nedenfor. Nævn det der er mest relevant. Hold tonen venlig og konkret.
Ingen markdown, ingen emojis.

DATA:
{data}

Skriv briefingen:`;

const TEMPLATE_EVENING = `Du er Skynet. Skriv en kort dansk aftenbriefing — max 4 linjer.
Brug data nedenfor. Fokuser på dagen der er gået og status nu. Hold tonen afrundende.
Ingen markdown, ingen emojis.

DATA:
{data}

Skriv briefingen:`;

async function gatherData(): Promise<string> {
  const lines: string[] = [];

  // Hent parallelt — tolerér fejl
  const [system, weather, energy, disk, services] = await Promise.allSettled([
    collectSystem(),
    collectWeather(),
    collectEnergy(),
    collectDisk(),
    listServices(),
  ]);

  if (weather.status === "fulfilled") {
    const c = weather.value.current;
    lines.push(
      `Vejr (${weather.value.location}): ${c.temp.toFixed(1)}°C, føles ${c.feelsLike.toFixed(0)}°C, vind ${c.windSpeed.toFixed(0)} m/s, ${c.humidity.toFixed(0)}% luftfugtighed`
    );
  }

  if (energy.status === "fulfilled") {
    const e = energy.value;
    const price = e.region === "DK2" ? e.priceDK2Kr : e.priceDK1Kr;
    if (price != null) {
      const ore = Math.round(price * 100);
      lines.push(
        `El-spotpris (${e.region}): ${ore} øre/kWh · grøn andel ${e.greenPct.toFixed(0)}%`
      );
    }
  }

  if (system.status === "fulfilled") {
    const s = system.value;
    lines.push(
      `System: CPU ${s.cpu.load.toFixed(0)}%, RAM ${s.memory.percent.toFixed(0)}%${
        s.temperature != null ? `, ${s.temperature.toFixed(0)}°C` : ""
      }`
    );
  }

  if (disk.status === "fulfilled") {
    const main = disk.value.devices[0] ?? disk.value.mounts[0];
    if (main) {
      const freeGB = ((main.totalBytes - main.usedBytes) / 1e9).toFixed(0);
      lines.push(
        `Disk: ${main.percentUsed.toFixed(0)}% brugt (${freeGB} GB fri)`
      );
    }
  }

  if (services.status === "fulfilled") {
    const stopped = services.value.filter((s) => !s.running);
    if (stopped.length > 0) {
      lines.push(`Stoppede services: ${stopped.map((s) => s.name).join(", ")}`);
    } else if (services.value.length > 0) {
      lines.push(`Alle ${services.value.length} services kører`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "(ingen data tilgængelig)";
}

export async function runBriefing(
  type: BriefingType,
  model?: string
): Promise<BriefingResult> {
  const { baseUrl, apiKey } = getLLMConfig();
  const data = await gatherData();

  const template = type === "morning" ? TEMPLATE_MORNING : TEMPLATE_EVENING;
  const prompt = template.replace("{data}", data);
  const chosenModel = model || (await pickFirstModel(baseUrl, apiKey));
  if (!chosenModel) {
    return { ok: false, message: "ingen LM Studio-model tilgængelig" };
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: chosenModel,
        stream: false,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        message: `LM Studio HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`,
      };
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false, message: "tom LLM-respons" };

    const title = type === "morning" ? "Godmorgen" : "Godaften";
    const priority = type === "morning" ? "default" : "low";
    const results = await notify({ title, body: text, priority });
    const okCount = results.filter((r) => r.ok).length;

    return {
      ok: okCount > 0 || results.length === 0,
      message: `${text.length} tegn gen · notify ${okCount}/${results.length}`,
      text,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
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
