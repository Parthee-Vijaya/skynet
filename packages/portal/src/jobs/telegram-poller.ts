/**
 * Telegram-poller — long-polling getUpdates → forward til
 * /api/telegram/inbound.
 *
 * Tracker last seen update_id i settings (samme pattern som
 * imessage-poller). Long-polling betyder vi blokerer på Telegram's
 * server med 25 sek timeout — ingen polling-loop med 30s sleep.
 *
 * Sikkerhedsmodel:
 *   - Telegram-token holdes hemmelig i settings (gitignored DB)
 *   - allowlist (telegram_allowed_chat_ids) tjekkes både her OG i
 *     /api/telegram/inbound. Belt-and-suspenders.
 *   - Tom allowlist = NO replies (sikker default — botten ignorerer alt
 *     til man eksplicit tilføjer chat_ids)
 */

import {
  getTelegramBotToken,
  getTelegramAllowedChatIds,
  getSetting,
  setSetting,
} from "@/lib/settings";
import { getControlToken } from "@/lib/control/auth";
import { getUpdates, TelegramError } from "@/lib/integrations/telegram";
import { appendLog } from "@/lib/agent/log-buffer";

const LAST_UPDATE_KEY = "telegram_poller_last_update_id";
const ENABLED_KEY = "telegram_poller_enabled";

let started = false;
let stopRequested = false;
let runPromise: Promise<void> | null = null;

export function isPollerEnabled(): boolean {
  return getSetting(ENABLED_KEY) === "true";
}

export function setPollerEnabled(enabled: boolean): void {
  setSetting(ENABLED_KEY, enabled ? "true" : "false");
  if (enabled && !started) startPoller();
  if (!enabled) stopRequested = true;
}

export function startPoller(): void {
  if (started) return;
  started = true;
  stopRequested = false;
  if (!isPollerEnabled()) {
    console.log("[telegram-poller] disabled (sæt telegram_poller_enabled=true i settings)");
    return;
  }
  if (!getTelegramBotToken()) {
    console.warn("[telegram-poller] mangler bot-token — sæt det i /automations setup");
    return;
  }
  console.log("[telegram-poller] aktiv · long-polling /getUpdates");
  runPromise = runLoop().catch((e) => {
    console.error("[telegram-poller] loop crashed:", e);
    started = false;
  });
}

export function stopPoller(): void {
  stopRequested = true;
  started = false;
}

async function runLoop(): Promise<void> {
  let offset = parseInt(getSetting(LAST_UPDATE_KEY) ?? "0", 10) + 1;
  let backoffMs = 1000;

  while (!stopRequested) {
    if (!isPollerEnabled()) {
      // Toggle off mens vi kørte → afslut blødt
      break;
    }
    try {
      const updates = await getUpdates({ offset, timeoutSec: 25 });
      backoffMs = 1000;
      for (const u of updates) {
        await processUpdate(u);
        offset = u.update_id + 1;
        setSetting(LAST_UPDATE_KEY, String(u.update_id));
      }
    } catch (e) {
      if (e instanceof TelegramError) {
        if (e.code === 401 || e.code === 404) {
          appendLog("error", `Telegram-token afvist (${e.code}) — poller stopper`, { tool: "telegram-poller" });
          break;
        }
      }
      // Generel fejl: backoff og prøv igen
      const msg = e instanceof Error ? e.message : "ukendt fejl";
      appendLog("warn", `Telegram-poll fejl: ${msg.slice(0, 120)} · retry om ${backoffMs}ms`, { tool: "telegram-poller" });
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
  }
  started = false;
  console.log("[telegram-poller] stoppet");
}

async function processUpdate(u: { update_id: number; message?: { chat: { id: number }; from?: { id: number; username?: string }; text?: string; message_id: number } }): Promise<void> {
  const m = u.message;
  if (!m || !m.text) return; // ignorer non-tekst (billeder, stickers, etc) for nu

  const chatId = String(m.chat.id);
  const allowed = getTelegramAllowedChatIds();

  // Allowlist: tom → afvis alt (sikker default).
  // Brugeren kan tilføje sit chat_id via UI'et.
  if (allowed.length === 0) {
    appendLog("warn", `Telegram afvist · ingen allowlist · chat_id=${chatId} besked="${m.text.slice(0, 60)}"`, { tool: "telegram-poller" });
    return;
  }
  if (!allowed.includes(chatId)) {
    appendLog("warn", `Telegram afvist · chat_id=${chatId} ikke i allowlist · besked="${m.text.slice(0, 60)}"`, { tool: "telegram-poller" });
    return;
  }

  appendLog("info", `Telegram modtaget fra chat ${chatId} (${m.from?.username ?? "?"}): ${m.text.slice(0, 60)}`, { tool: "telegram-poller" });

  // Forward til inbound-endpoint så samme LLM-flow + tools + loop-guard genbruges
  try {
    const port = process.env.PORT ?? "3100";
    const token = getControlToken();
    await fetch(`http://localhost:${port}/api/telegram/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        chatId: m.chat.id,
        message: m.text,
        replyToMessageId: m.message_id,
        username: m.from?.username,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    appendLog("error", `Telegram-inbound dispatch fejl: ${e instanceof Error ? e.message : "ukendt"}`, { tool: "telegram-poller" });
  }
}
