/**
 * Tool-dispatcher: eksekverer tool-calls fra LM Studio ved at route dem til
 * eksisterende API-endpoints (via direkte funktionskald — ingen HTTP-roundtrip
 * internt, da vi allerede er på serveren).
 *
 * Dette holder auth & allowlist konsistent: tools genbruger præcis samme
 * codepaths som UI-knapper.
 */

import { listServices, controlService } from "@/lib/control/services";
import { listApps, controlApp } from "@/lib/control/apps";
import { listDir, readTextPreview } from "@/lib/control/files";
import { collect as collectSystem } from "@/lib/collectors/system";
import { collect as collectDisk } from "@/lib/collectors/disk";
import { collect as collectWeather } from "@/lib/collectors/weather";
import { collect as collectEnergy } from "@/lib/collectors/energy";
import {
  listTodayEvents,
  listUpcomingEvents,
} from "@/lib/integrations/calendar";
import {
  listReminders,
  addReminder,
  completeReminder,
} from "@/lib/integrations/reminders";
import { isDestructive } from "./tools";

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  ok: boolean;
  /** JSON-stringified result indhold — LM Studio forventer strings for tool-returns */
  content: string;
  /** True hvis tool-call blev blokeret pga. sikkerhed */
  blocked?: boolean;
  /** Grund til blokering hvis blocked */
  blockReason?: string;
}

/**
 * Eksekverer en enkelt tool-call. Returnerer altid et ToolCallResult (aldrig
 * throw) så LM Studio kan se resultat uanset succes/fejl.
 */
export async function dispatchTool(
  req: ToolCallRequest,
  opts: { allowDestructive: boolean } = { allowDestructive: false }
): Promise<ToolCallResult> {
  // Guardrail: blokér destruktive actions medmindre UI eksplicit har bekræftet
  if (isDestructive(req.name, req.arguments) && !opts.allowDestructive) {
    return {
      id: req.id,
      name: req.name,
      ok: false,
      blocked: true,
      blockReason:
        "Destruktiv action kræver brugerens bekræftelse. Bed brugeren om at bekræfte i UI.",
      content: JSON.stringify({
        blocked: true,
        reason: "kræver bekræftelse",
        suggestion:
          "Fortæl brugeren hvad du vil gøre, og bed dem bekræfte eksplicit før genudførelse.",
      }),
    };
  }

  try {
    const result = await execute(req.name, req.arguments);
    return {
      id: req.id,
      name: req.name,
      ok: true,
      content: safeStringify(result),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      id: req.id,
      name: req.name,
      ok: false,
      content: JSON.stringify({ error: msg }),
    };
  }
}

async function execute(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    // ── Services ──────────────────────────────────────────────────────────
    case "list_services": {
      const services = await listServices();
      return {
        services: services.map((s) => ({
          label: s.label,
          name: s.name,
          description: s.description,
          running: s.running,
          loaded: s.loaded,
          pid: s.pid,
          allowed_actions: s.actions,
        })),
      };
    }
    case "control_service": {
      const label = String(args.label ?? "");
      const action = String(args.action ?? "") as
        | "start"
        | "stop"
        | "restart"
        | "status";
      if (!label || !["start", "stop", "restart", "status"].includes(action)) {
        throw new Error("label eller action mangler/ugyldig");
      }
      const res = await controlService(label, action);
      return res;
    }

    // ── Apps ──────────────────────────────────────────────────────────────
    case "list_apps": {
      const apps = await listApps();
      return {
        apps: apps.map((a) => ({
          name: a.name,
          category: a.category,
          running: a.running,
        })),
      };
    }
    case "control_app": {
      const appName = String(args.name ?? "");
      const action = String(args.action ?? "") as "launch" | "quit" | "focus";
      if (!appName || !["launch", "quit", "focus"].includes(action)) {
        throw new Error("name eller action mangler/ugyldig");
      }
      const res = await controlApp(appName, action);
      return res;
    }

    // ── System / telemetri ────────────────────────────────────────────────
    case "read_system_status": {
      const s = await collectSystem();
      return s;
    }
    case "read_disk": {
      const d = await collectDisk();
      return d;
    }
    case "read_weather": {
      const w = await collectWeather();
      return w;
    }
    case "read_energy": {
      const e = await collectEnergy();
      return e;
    }

    // ── Filbrowser ────────────────────────────────────────────────────────
    case "list_files": {
      const root = String(args.root ?? "");
      const path = String(args.path ?? "");
      const listing = await listDir(root, path);
      if (!listing) throw new Error("root eller sti ugyldig");
      return {
        root: listing.root.name,
        path: listing.rel,
        absolute: listing.absolute,
        entries: listing.entries.map((e) => ({
          name: e.name,
          type: e.type,
          size: e.size,
          ext: e.ext,
          rel: e.rel,
        })),
      };
    }
    case "read_file": {
      const root = String(args.root ?? "");
      const path = String(args.path ?? "");
      const preview = await readTextPreview(root, path);
      if (!preview) throw new Error("fil ugyldig eller udenfor root");
      if (preview.kind !== "text") {
        return {
          kind: preview.kind,
          size: preview.size,
          mime: preview.mime,
          note: "Ikke-tekst fil — kan ikke læses som tekst",
        };
      }
      return {
        kind: "text",
        size: preview.size,
        truncated: preview.truncated,
        content: preview.content,
      };
    }

    // ── Calendar ──────────────────────────────────────────────────────────
    case "list_calendar_events": {
      const hours = typeof args.hours === "number" ? args.hours : undefined;
      const calendars = Array.isArray(args.calendars)
        ? (args.calendars as string[])
        : undefined;
      const events = hours
        ? await listUpcomingEvents(hours, calendars)
        : await listTodayEvents(calendars);
      return {
        events: events.map((e) => ({
          uid: e.uid,
          calendar: e.calendar,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          location: e.location,
        })),
        count: events.length,
      };
    }

    // ── Reminders ─────────────────────────────────────────────────────────
    case "list_reminders": {
      const list = typeof args.list === "string" ? args.list : undefined;
      const includeCompleted =
        typeof args.includeCompleted === "boolean"
          ? args.includeCompleted
          : false;
      const reminders = await listReminders({ list, includeCompleted });
      return {
        reminders: reminders.map((r) => ({
          id: r.id,
          list: r.list,
          title: r.title,
          completed: r.completed,
          dueDate: r.dueDate,
          priority: r.priority,
        })),
        count: reminders.length,
      };
    }
    case "add_reminder": {
      const title = String(args.title ?? "");
      if (!title) throw new Error("title mangler");
      const res = await addReminder({
        title,
        list: typeof args.list === "string" ? args.list : undefined,
        dueDate: typeof args.dueDate === "string" ? args.dueDate : undefined,
        body: typeof args.body === "string" ? args.body : undefined,
      });
      return res;
    }
    case "complete_reminder": {
      const id = String(args.id ?? "");
      if (!id) throw new Error("id mangler");
      return await completeReminder(id);
    }

    // ── Discovery ─────────────────────────────────────────────────────────
    case "run_discovery": {
      const res = await fetch("http://localhost:3100/api/control/discover", {
        headers: { Origin: "http://localhost:3100", Host: "localhost:3100" },
      });
      if (!res.ok) throw new Error(`discover fejlede: HTTP ${res.status}`);
      return await res.json();
    }

    // ── iMessage ─────────────────────────────────────────────────────────
    case "send_imessage": {
      const rawTo = String(args.to ?? "").trim();
      const to = normalizeImessageRecipient(rawTo);
      const msg = String(args.message ?? "").trim();
      if (!to || !msg) throw new Error("to og message er påkrævet");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileP = promisify(execFile);
      // Escape for AppleScript string literals
      const safeMsg = msg.replace(/\\/g, "\\\\").replace(/"/g, '\\"').slice(0, 2000);
      const safeTo = to.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const script = [
        'tell application "Messages"',
        '  set targetService to first service whose service type = iMessage',
        `  send "${safeMsg}" to buddy "${safeTo}" of targetService`,
        "end tell",
      ].join("\n");
      await execFileP("/usr/bin/osascript", ["-e", script], { timeout: 12_000 });
      return { ok: true, to, sent: true, message: "iMessage sendt" };
    }

    // ── News (RSS) ────────────────────────────────────────────────────────
    case "fetch_news": {
      const feedUrl = String(args.url ?? "").trim();
      const limit = Math.min(typeof args.limit === "number" ? Math.round(args.limit) : 8, 20);
      if (!feedUrl.startsWith("http://") && !feedUrl.startsWith("https://")) {
        throw new Error("url skal starte med http:// eller https://");
      }
      const rssRes = await fetch(feedUrl, {
        headers: {
          "User-Agent": "SkynetBot/1.0",
          Accept: "application/rss+xml,application/xml,text/xml,*/*",
        },
        signal: AbortSignal.timeout(10_000),
        redirect: "follow",
      });
      if (!rssRes.ok) throw new Error(`RSS fetch fejlede: HTTP ${rssRes.status}`);
      const xml = await rssRes.text();
      // Simpel regex-baseret RSS-parser (dækker RSS 2.0 og Atom)
      const items: Array<{ title: string; link: string; date: string; description: string }> = [];
      const itemRe = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
      let m: RegExpExecArray | null;
      while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
        const b = m[1];
        const stripHtml = (s: string) =>
          s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/\s{2,}/g, " ").trim();
        const cdata = (tag: string) =>
          (b.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i")) ??
           b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")))?.[1]?.trim() ?? "";
        const title = stripHtml(cdata("title"));
        const link =
          (b.match(/<link[^>]*href=["']([^"']+)["']/i))?.[1]?.trim() ??
          stripHtml(cdata("link")).split(" ")[0] ?? "";
        const date = (b.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i))?.[1]?.trim() ?? "";
        const description = stripHtml(cdata("description") || cdata("summary") || cdata("content")).slice(0, 250);
        if (title) items.push({ title, link, date, description });
      }
      return { url: feedUrl, items, count: items.length };
    }

    // ── Web: Fetch ────────────────────────────────────────────────────────
    case "web_fetch": {
      const url = String(args.url ?? "").trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new Error("url skal starte med http:// eller https://");
      }
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SkynetBot/1.0; +https://localhost)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(10_000),
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      // Strip HTML tags og kondenser whitespace
      const text = ct.includes("html")
        ? raw
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&quot;/gi, '"')
            .replace(/\s{2,}/g, " ")
            .trim()
        : raw.trim();
      const MAX = 4000;
      return {
        url,
        content: text.length > MAX ? text.slice(0, MAX) + "…[trunkeret]" : text,
        length: text.length,
        truncated: text.length > MAX,
      };
    }

    // ── Web: Search (DuckDuckGo Instant Answers + HTML scrape) ───────────
    case "web_search": {
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("query mangler");

      // DuckDuckGo Instant Answer API (gratis, ingen nøgle)
      const iaUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const iaRes = await fetch(iaUrl, {
        headers: { "User-Agent": "SkynetBot/1.0" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!iaRes.ok) throw new Error(`DuckDuckGo API HTTP ${iaRes.status}`);
      const ia = (await iaRes.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        AbstractSource?: string;
        RelatedTopics?: Array<{
          Text?: string;
          FirstURL?: string;
          Topics?: Array<{ Text?: string; FirstURL?: string }>;
        }>;
        Results?: Array<{ Text?: string; FirstURL?: string }>;
        Answer?: string;
      };

      const results: Array<{ title: string; url: string; snippet: string }> = [];

      // Instant Answer / Abstract
      if (ia.AbstractText) {
        results.push({
          title: ia.AbstractSource ?? "Wikipedia",
          url: ia.AbstractURL ?? "",
          snippet: ia.AbstractText.slice(0, 400),
        });
      }
      if (ia.Answer) {
        results.push({ title: "Direkte svar", url: "", snippet: ia.Answer });
      }

      // Related topics
      for (const t of ia.RelatedTopics ?? []) {
        if (results.length >= 5) break;
        if (t.Text && t.FirstURL) {
          results.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text.slice(0, 300) });
        }
        // Nested topics
        for (const sub of t.Topics ?? []) {
          if (results.length >= 5) break;
          if (sub.Text && sub.FirstURL) {
            results.push({ title: sub.Text.slice(0, 80), url: sub.FirstURL, snippet: sub.Text.slice(0, 300) });
          }
        }
      }

      // Top results
      for (const r of ia.Results ?? []) {
        if (results.length >= 5) break;
        if (r.Text && r.FirstURL) {
          results.push({ title: r.Text.slice(0, 80), url: r.FirstURL, snippet: r.Text.slice(0, 300) });
        }
      }

      return {
        query,
        results,
        count: results.length,
        note: results.length === 0
          ? "Ingen øjeblikkelige resultater — prøv web_fetch på en specifik URL"
          : undefined,
      };
    }

    default:
      throw new Error(`ukendt tool: ${name}`);
  }
}

/**
 * Normaliser en iMessage-modtager til noget osascript/Messages.app kan løse.
 *
 * - Email (Apple-ID) → uændret
 * - Starter med '+' → antages allerede E.164, uændret
 * - 8 cifre → antaget dansk mobilnummer → '+45XXXXXXXX'
 * - 10+ cifre → antaget med landekode → prefix '+'
 * - Alt andet → lad osascript selv afgøre (fx navn fra Kontakter)
 */
function normalizeImessageRecipient(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (s.includes("@")) return s;
  if (s.startsWith("+")) return s;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 8) return `+45${digits}`;
  if (digits.length === 10 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return s;
}

/** JSON.stringify med fallback til String() + begrænsning */
function safeStringify(val: unknown, maxLen = 8000): string {
  try {
    const s = JSON.stringify(val);
    if (s.length > maxLen) {
      return s.slice(0, maxLen) + "…[trunkeret]";
    }
    return s;
  } catch {
    return String(val).slice(0, maxLen);
  }
}
