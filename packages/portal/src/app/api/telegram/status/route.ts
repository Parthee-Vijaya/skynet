/**
 * GET   /api/telegram/status — bot-info + poller-state + allowlist
 * PATCH /api/telegram/status — { enabled?: bool, botToken?: string, allowedChatIds?: string }
 *
 * Bruges af /automations setup-tab til at konfigurere botten og toggle
 * polleren live uden portal-restart.
 */

import { NextRequest } from "next/server";
import {
  isPollerEnabled,
  setPollerEnabled,
  startPoller as startTelegramPoller,
} from "@/jobs/telegram-poller";
import {
  getTelegramBotToken,
  setTelegramBotToken,
  getTelegramAllowedChatIds,
  setTelegramAllowedChatIds,
} from "@/lib/settings";
import { getMe, TelegramError } from "@/lib/integrations/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StatusResponse {
  enabled: boolean;
  hasBotToken: boolean;
  allowedChatIds: string[];
  bot?: { id: number; username: string; first_name: string };
  botError?: string;
}

async function buildStatus(): Promise<StatusResponse> {
  const enabled = isPollerEnabled();
  const hasBotToken = !!getTelegramBotToken();
  const allowedChatIds = getTelegramAllowedChatIds();
  let bot: StatusResponse["bot"];
  let botError: string | undefined;
  if (hasBotToken) {
    try {
      bot = await getMe();
    } catch (e) {
      botError = e instanceof TelegramError ? `${e.code ?? "?"}: ${e.message}` : (e instanceof Error ? e.message : "ukendt fejl");
    }
  }
  return { enabled, hasBotToken, allowedChatIds, bot, botError };
}

export async function GET(): Promise<Response> {
  return Response.json(await buildStatus());
}

export async function PATCH(req: NextRequest): Promise<Response> {
  let body: { enabled?: boolean; botToken?: string; allowedChatIds?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.botToken === "string" && body.botToken.trim()) {
    setTelegramBotToken(body.botToken);
  }
  if (typeof body.allowedChatIds === "string") {
    setTelegramAllowedChatIds(body.allowedChatIds);
  }
  if (typeof body.enabled === "boolean") {
    setPollerEnabled(body.enabled);
    if (body.enabled) {
      // Hvis token lige er sat: forsøg at starte polleren igen
      try { startTelegramPoller(); } catch { /* noop */ }
    }
  }
  return Response.json(await buildStatus());
}
