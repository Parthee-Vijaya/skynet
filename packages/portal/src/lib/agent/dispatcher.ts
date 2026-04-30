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
import { findTrainRoute, RejseplanenError } from "@/lib/integrations/rejseplanen";
import { searchNzbgeek, NzbgeekError } from "@/lib/integrations/nzbgeek";
import { sendMessage as sendTelegramMessage, TelegramError } from "@/lib/integrations/telegram";
import { getTelegramAllowedChatIds } from "@/lib/settings";
import {
  getForecast,
  lookupAddress,
  wikipediaSummary,
  getWeatherWarnings,
  searchRecipes,
  redditSearch,
  getNews,
} from "@/lib/integrations/info-tools";
import { collect as collectTraffic } from "@/lib/collectors/traffic";
import { collect as collectAir } from "@/lib/collectors/air";
import { collect as collectMarkets } from "@/lib/collectors/markets";
import { collect as collectFlights } from "@/lib/collectors/flights";
import { collect as collectMoon } from "@/lib/collectors/moon";
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

    // ── Forecast: 7-dages vejr ───────────────────────────────────────────
    case "get_forecast": {
      const days = typeof args.days === "number" ? Math.round(args.days) : 7;
      return await getForecast(days);
    }

    // ── Trafikinfo (Vejdirektoratet) ──────────────────────────────────────
    case "read_traffic": {
      const data = await collectTraffic();
      // Komprimer til de mest relevante felter — undgå at flooke LLM med rå geo
      return {
        total: data.total,
        fetchedAt: data.fetchedAt,
        incidents: data.incidents.slice(0, 25).map((i) => ({
          title: i.title,
          header: i.header,
          description: i.description.slice(0, 240),
          layer: i.layer,
          begin: i.begin,
          updated: i.updated,
          priority: i.priority,
        })),
        ...(data.error ? { error: data.error } : {}),
      };
    }

    // ── Luftkvalitet + pollen ─────────────────────────────────────────────
    case "read_air_quality": {
      return await collectAir();
    }

    // ── Markeder (råvarer + valuta) ───────────────────────────────────────
    case "read_markets": {
      return await collectMarkets();
    }

    // ── Fly i nærheden ────────────────────────────────────────────────────
    case "read_flights": {
      const data = await collectFlights();
      return {
        count: data.count,
        radiusKm: data.radiusKm,
        fetchedAt: data.fetchedAt,
        flights: data.flights.slice(0, 30),
        ...(data.error ? { error: data.error } : {}),
      };
    }

    // ── Månefase ──────────────────────────────────────────────────────────
    case "read_moon": {
      return await collectMoon();
    }

    // ── DAWA address-opslag ───────────────────────────────────────────────
    case "lookup_address": {
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("query er påkrævet");
      const matches = await lookupAddress(query, 5);
      return { query, count: matches.length, matches };
    }

    // ── Wikipedia ─────────────────────────────────────────────────────────
    case "wikipedia_summary": {
      const title = String(args.title ?? "").trim();
      if (!title) throw new Error("title er påkrævet");
      const lang = typeof args.lang === "string" && args.lang.length === 2 ? args.lang : "da";
      return await wikipediaSummary(title, lang);
    }

    // ── Vejrvarsler (MeteoAlarm) ─────────────────────────────────────────
    case "get_weather_warnings": {
      const warnings = await getWeatherWarnings();
      return {
        count: warnings.length,
        warnings,
        message: warnings.length === 0 ? "Ingen aktive vejrvarsler i Danmark lige nu" : undefined,
      };
    }

    // ── Opskrifter (TheMealDB) ───────────────────────────────────────────
    case "search_recipes": {
      const query = String(args.query ?? "").trim();
      const recipes = await searchRecipes(query, 5);
      if (recipes.length === 0) {
        return { ok: false, query, message: `Ingen opskrifter fundet for "${query}". TheMealDB er en engelsk database — prøv et engelsk søgeord.` };
      }
      return { query, count: recipes.length, recipes };
    }

    // ── Reddit ────────────────────────────────────────────────────────────
    case "reddit_search": {
      const subreddit = typeof args.subreddit === "string" ? args.subreddit.replace(/^r\//i, "").trim() : undefined;
      const query = typeof args.query === "string" ? args.query.trim() : undefined;
      if (!subreddit && !query) {
        throw new Error("subreddit eller query er påkrævet");
      }
      const sort = typeof args.sort === "string" ? args.sort as "hot" | "top" | "new" | "rising" | "relevance" : undefined;
      const time = typeof args.time === "string" ? args.time as "hour" | "day" | "week" | "month" | "year" | "all" : undefined;
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      const posts = await redditSearch({ subreddit, query, sort, time, limit });
      return { count: posts.length, posts };
    }

    // ── NZBgeek (trending + søgning) ──────────────────────────────────────
    case "search_nzbgeek": {
      const query = typeof args.query === "string" ? args.query.trim() : undefined;
      const mode = typeof args.mode === "string" ? args.mode as "trending" | "search" | "tv" | "movie" : undefined;
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      try {
        const result = await searchNzbgeek({ query, mode, limit });
        // Komprimer items: drop coverurl/description hvis tomme, oversæt size til MB
        const items = result.items.map((it) => ({
          title: it.title,
          pubDate: it.pubDate,
          imdbId: it.imdbId,
          tvdbId: it.tvdbId,
          category: it.category,
          sizeMB: it.sizeBytes ? Math.round(it.sizeBytes / 1024 / 1024) : undefined,
          detailUrl: it.detailUrl,
          downloadUrl: it.link,
          coverUrl: it.coverUrl,
        }));
        return { mode: result.mode, total: result.total, count: items.length, items };
      } catch (e) {
        if (e instanceof NzbgeekError) {
          return {
            ok: false,
            error: e.message,
            code: e.code,
            hint: e.code === "NOT_CONFIGURED"
              ? "Bed brugeren om at sætte nzbgeek_api_key i /automations setup-tab"
              : e.code === "API_AUTH"
                ? "API-nøglen blev afvist — bed brugeren tjekke den i settings"
                : undefined,
          };
        }
        throw e;
      }
    }

    // ── Aggregeret nyhedstool ─────────────────────────────────────────────
    case "get_news": {
      const scope = typeof args.scope === "string" ? args.scope as "dk" | "world" | "both" : "both";
      const limitPerSource = typeof args.limitPerSource === "number" ? args.limitPerSource : 3;
      return await getNews({ scope, limitPerSource });
    }

    // ── Rejseplanen: find_train_route ────────────────────────────────────
    case "find_train_route": {
      const fromInput = String(args.from ?? "").trim();
      const toInput = String(args.to ?? "").trim();
      if (!fromInput || !toInput) throw new Error("from og to er påkrævet");
      const whenStr = typeof args.when === "string" ? args.when.trim() : "";
      const when = whenStr ? new Date(whenStr) : undefined;
      if (when && !Number.isFinite(when.getTime())) {
        throw new Error(`ugyldig when (forventet ISO-8601): ${whenStr}`);
      }
      const isArrival = args.isArrival === true;
      try {
        const result = await findTrainRoute(fromInput, toInput, { when, isArrival });
        // Komprimer trip-data så LLM får et kort overblik
        const trips = result.trips.slice(0, 3).map((t) => ({
          departure: t.departure,
          arrival: t.arrival,
          durationMin: t.durationMin,
          changes: t.changes,
          legs: t.legs.map((l) => ({
            line: l.line,
            category: l.category,
            direction: l.direction,
            track: l.track,
            from: l.fromName,
            to: l.toName,
            depart: l.departure,
            arrive: l.arrival,
            durationMin: l.durationMin,
          })),
        }));
        return {
          ok: true,
          from: result.from.name,
          to: result.to.name,
          tripCount: trips.length,
          trips,
        };
      } catch (e) {
        if (e instanceof RejseplanenError) {
          return {
            ok: false,
            error: e.message,
            code: e.code,
            hint: e.code === "NOT_CONFIGURED"
              ? "Bed brugeren om at sætte rejseplanen_access_id i /automations setup-tab"
              : e.code === "API_AUTH"
                ? "Access ID er ugyldig eller udløbet — bed brugeren tjekke det i settings"
                : e.code === "NOT_FOUND"
                  ? "Stationsnavn ikke fundet — prøv et andet eller mere præcist navn"
                  : undefined,
          };
        }
        throw e;
      }
    }

    // ── Telegram: send proaktiv besked ────────────────────────────────────
    case "send_telegram_message": {
      const chatId = typeof args.chatId === "number" ? args.chatId : parseInt(String(args.chatId ?? ""), 10);
      const message = String(args.message ?? "").trim();
      if (!Number.isFinite(chatId)) throw new Error("chatId skal være et number");
      if (!message) throw new Error("message er påkrævet");
      // Allowlist-check også i tool — forhindrer LLM i at sende til vilkårlige chats
      const allowed = getTelegramAllowedChatIds();
      if (!allowed.includes(String(chatId))) {
        return { ok: false, error: `chat_id ${chatId} er ikke i telegram_allowed_chat_ids — botten må ikke kontakte ukendte chats` };
      }
      try {
        const r = await sendTelegramMessage({ chatId, text: message });
        return { ok: true, messageId: r.message_id, chatId };
      } catch (e) {
        if (e instanceof TelegramError) {
          return { ok: false, error: e.message, code: e.code };
        }
        throw e;
      }
    }

    // ── Continue Claude Code-session ─────────────────────────────────────
    case "continue_claude_session": {
      const sessionId = String(args.sessionId ?? "").trim();
      const prompt = String(args.prompt ?? "").trim();
      const cwd = typeof args.cwd === "string" ? args.cwd.trim() : undefined;
      if (!sessionId || !/^[0-9a-fA-F-]{8,64}$/.test(sessionId)) {
        return { ok: false, error: "ugyldig sessionId — skal være UUID-format" };
      }
      if (!prompt) return { ok: false, error: "prompt er påkrævet" };
      // Kald vores eget endpoint så vi genbruger spawn-logikken
      const port = process.env.PORT ?? "3100";
      const { getControlToken } = await import("@/lib/control/auth");
      const token = getControlToken();
      try {
        const res = await fetch(`http://localhost:${port}/api/claude/continue`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId, prompt, cwd }),
          signal: AbortSignal.timeout(8_000),
        });
        const data = await res.json() as { ok: boolean; pid?: number; message?: string; error?: string };
        return data;
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "kunne ikke kalde continue-endpoint" };
      }
    }

    // ── Telegram: schedule one-off reminder ───────────────────────────────
    case "schedule_telegram_reminder": {
      const { createAutomation } = await import("./automations");
      const { reloadScheduler } = await import("@/jobs/scheduler");
      const chatId = typeof args.chatId === "number" ? args.chatId : parseInt(String(args.chatId ?? ""), 10);
      const message = String(args.message ?? "").trim();
      const sendAtIso = String(args.sendAtIso ?? "").trim();
      const name = String(args.name ?? "").trim() || "Telegram-påmindelse";
      if (!Number.isFinite(chatId)) throw new Error("chatId skal være et number");
      if (!message) throw new Error("message er påkrævet");
      if (!sendAtIso) throw new Error("sendAtIso er påkrævet (ISO-8601)");
      const ts = Date.parse(sendAtIso);
      if (!Number.isFinite(ts)) throw new Error(`ugyldig sendAtIso: ${sendAtIso}`);
      if (ts < Date.now() - 60_000) throw new Error("sendAtIso er i fortiden");
      const allowed = getTelegramAllowedChatIds();
      if (!allowed.includes(String(chatId))) {
        return { ok: false, error: `chat_id ${chatId} er ikke i allowlist` };
      }
      const created = createAutomation({
        name: name.slice(0, 64),
        description: `Telegram one-off · ${new Date(ts).toLocaleString("da-DK")}`,
        trigger: { type: "once", runAt: ts, deleteAfterRun: true },
        actions: [
          {
            type: "tool",
            tool: "send_telegram_message",
            args: { chatId, message },
          },
        ],
        enabled: true,
      });
      reloadScheduler();
      return {
        ok: true,
        automationId: created.id,
        sendsAt: new Date(ts).toISOString(),
        chatId,
        message: `Påmindelse oprettet (id ${created.id}). Sender Telegram-besked ${new Date(ts).toLocaleString("da-DK", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}.`,
      };
    }

    // ── One-off iMessage reminder ────────────────────────────────────────
    case "schedule_imessage_reminder": {
      const { createAutomation } = await import("./automations");
      const { reloadScheduler } = await import("@/jobs/scheduler");
      const { getImessageDefault } = await import("@/lib/settings");
      const rawTo = String(args.to ?? "").trim() || getImessageDefault();
      if (!rawTo) {
        throw new Error("ingen modtager: angiv 'to' eller sæt iMessage-default i settings");
      }
      const to = normalizeImessageRecipient(rawTo);
      const message = String(args.message ?? "").trim();
      const sendAtIso = String(args.sendAtIso ?? "").trim();
      const name = String(args.name ?? "").trim() || "iMessage-påmindelse";
      if (!message) throw new Error("message er påkrævet");
      if (!sendAtIso) throw new Error("sendAtIso er påkrævet (ISO-8601)");
      const ts = Date.parse(sendAtIso);
      if (!Number.isFinite(ts)) throw new Error(`ugyldig sendAtIso: ${sendAtIso}`);
      if (ts < Date.now() - 60_000) {
        throw new Error("sendAtIso er i fortiden");
      }
      const created = createAutomation({
        name: name.slice(0, 64),
        description: `One-off reminder · ${new Date(ts).toLocaleString("da-DK")}`,
        trigger: { type: "once", runAt: ts, deleteAfterRun: true },
        actions: [
          {
            type: "tool",
            tool: "send_imessage",
            args: { to, message },
          },
        ],
        enabled: true,
      });
      reloadScheduler();
      return {
        ok: true,
        automationId: created.id,
        sendsAt: new Date(ts).toISOString(),
        to,
        message: `Påmindelse oprettet (id ${created.id}). Sender iMessage til ${to} ${new Date(ts).toLocaleString("da-DK", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}.`,
      };
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

    // ── Web: Search (DDG Instant Answers + HTML SERP scrape) ─────────────
    case "web_search": {
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("query mangler");

      const results: Array<{ title: string; url: string; snippet: string }> = [];

      // 1) DuckDuckGo Instant Answer API — knowledge graph snippets, ofte tomt
      try {
        const iaUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const iaRes = await fetch(iaUrl, {
          headers: { "User-Agent": "SkynetBot/1.0" },
          signal: AbortSignal.timeout(6_000),
        });
        if (iaRes.ok) {
          const ia = (await iaRes.json()) as {
            AbstractText?: string;
            AbstractURL?: string;
            AbstractSource?: string;
            Answer?: string;
          };
          if (ia.Answer) results.push({ title: "Direkte svar", url: "", snippet: ia.Answer });
          if (ia.AbstractText) {
            results.push({
              title: ia.AbstractSource ?? "Wikipedia",
              url: ia.AbstractURL ?? "",
              snippet: ia.AbstractText.slice(0, 400),
            });
          }
        }
      } catch { /* IA er nice-to-have, fortsæt med HTML SERP */ }

      // 2) DDG HTML SERP — det egentlige web-search-resultat
      try {
        const htmlRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: {
            // Almindelig browser-UA — DDG returnerer meget tyndere HTML uden
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "da-DK,da;q=0.9,en;q=0.6",
          },
          signal: AbortSignal.timeout(8_000),
          redirect: "follow",
        });
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          // DDG indkapsler hver hit i <a class="result__a" href="..."> og en
          // <a class="result__snippet" ...>SNIPPET</a> tæt på
          const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
          const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
          const links: Array<{ href: string; title: string }> = [];
          const snippets: string[] = [];
          let m: RegExpExecArray | null;
          while ((m = linkRe.exec(html)) !== null) {
            links.push({ href: decodeDdgUrl(m[1]), title: stripHtml(m[2]) });
            if (links.length >= 8) break;
          }
          while ((m = snippetRe.exec(html)) !== null) {
            snippets.push(stripHtml(m[1]).slice(0, 300));
            if (snippets.length >= 8) break;
          }
          for (let i = 0; i < links.length && results.length < 8; i++) {
            results.push({
              title: links[i].title.slice(0, 100),
              url: links[i].href,
              snippet: snippets[i] ?? "",
            });
          }
        }
      } catch { /* HTML SERP failed — IA-resultater er måske stadig brugbare */ }

      return {
        query,
        results,
        count: results.length,
        note: results.length === 0
          ? "Ingen resultater — prøv en mere specifik query, eller web_fetch på en kendt URL"
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

/** Strip HTML-tags + de mest almindelige entities */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** DDG html-SERP wrapper /l/?uddg=<encoded-url> → unwrap til ren URL */
function decodeDdgUrl(href: string): string {
  if (href.startsWith("//duckduckgo.com/l/")) {
    try {
      const u = new URL("https:" + href);
      const real = u.searchParams.get("uddg");
      if (real) return decodeURIComponent(real);
    } catch { /* fall through */ }
  }
  if (href.startsWith("/l/")) {
    try {
      const u = new URL("https://duckduckgo.com" + href);
      const real = u.searchParams.get("uddg");
      if (real) return decodeURIComponent(real);
    } catch { /* fall through */ }
  }
  return href;
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
