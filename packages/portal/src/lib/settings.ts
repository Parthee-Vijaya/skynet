import { getDb } from "./db";

export function getSetting(key: string): string | undefined {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP"
    )
    .run(key, value, value);
}

export function getSettingJSON<T>(key: string, fallback: T): T {
  const raw = getSetting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setSettingJSON(key: string, value: unknown): void {
  setSetting(key, JSON.stringify(value));
}

export interface LocationSetting {
  lat: number;
  lng: number;
  label: string;
}

export const DEFAULT_LOCATION: LocationSetting = {
  lat: 55.6761,
  lng: 12.5683,
  label: "København",
};

export function getLocation(): LocationSetting {
  return getSettingJSON("location", DEFAULT_LOCATION);
}

// --- User profile ---

export function getUserName(): string {
  return getSetting("user_name") ?? "";
}

export function setUserName(name: string): void {
  setSetting("user_name", name.trim().slice(0, 64));
}

/**
 * Default iMessage-modtager (telefonnummer eller iCloud-adresse).
 * Bruges af automation-templates og inbound iMessage-handler.
 * Format: '+4512345678' eller 'navn@icloud.com'.
 */
export function getImessageDefault(): string {
  return getSetting("imessage_default") ?? "";
}

export function setImessageDefault(value: string): void {
  setSetting("imessage_default", value.trim().slice(0, 128));
}

/**
 * Rejseplanen access ID — bruges af find_train_route tool. Gratis nøgle
 * fås ved at registrere sig på Rejseplanen (https://help.rejseplanen.dk/).
 * Uden nøgle returnerer toolet en klar fejl.
 */
export function getRejseplanenAccessId(): string {
  return getSetting("rejseplanen_access_id") ?? "";
}

export function setRejseplanenAccessId(value: string): void {
  setSetting("rejseplanen_access_id", value.trim().slice(0, 256));
}

/**
 * NZBgeek API-nøgle (din "r"/"apikey" fra api.nzbgeek.info). Bruges af
 * search_nzbgeek tool til trending-feeds og fri søgning.
 */
export function getNzbgeekApiKey(): string {
  return getSetting("nzbgeek_api_key") ?? "";
}

export function setNzbgeekApiKey(value: string): void {
  setSetting("nzbgeek_api_key", value.trim().slice(0, 256));
}

/**
 * Jellyfin Media Server — URL + API-key. Generér key i Jellyfin →
 * Dashboard → API Keys. Default URL er localhost:8096 (Jellyfin's
 * default port).
 */
export function getJellyfinUrl(): string {
  return getSetting("jellyfin_url") ?? "http://localhost:8096";
}

export function setJellyfinUrl(value: string): void {
  setSetting("jellyfin_url", value.trim().replace(/\/+$/, "").slice(0, 256));
}

export function getJellyfinApiKey(): string {
  return getSetting("jellyfin_api_key") ?? "";
}

export function setJellyfinApiKey(value: string): void {
  setSetting("jellyfin_api_key", value.trim().slice(0, 256));
}

/**
 * Skynet public URL — bruges til ntfy click-URLs og action-buttons.
 * Skal være en URL som iPhone/eksterne devices kan nå (typisk Tailscale
 * MagicDNS, fx http://parthee-mac.tail-XXXX.ts.net:3100).
 *
 * Tom = vi udelader click-URL i ntfy, så tap på notif blot åbner ntfy-
 * appen naturligt i stedet for at lande på localhost (som kun virker fra
 * Mac selv).
 */
export function getSkynetPublicUrl(): string {
  return getSetting("skynet_public_url") ?? "";
}

export function setSkynetPublicUrl(value: string): void {
  setSetting("skynet_public_url", value.trim().replace(/\/+$/, "").slice(0, 256));
}

/**
 * Telegram bot — token fra @BotFather. Tom = poller deaktiveret.
 */
export function getTelegramBotToken(): string {
  return getSetting("telegram_bot_token") ?? "";
}

export function setTelegramBotToken(value: string): void {
  setSetting("telegram_bot_token", value.trim().slice(0, 256));
}

/**
 * Komma-separeret liste af tilladte Telegram chat_ids. Tom = ingen
 * (sikker default — botten svarer kun til kendte chats).
 */
export function getTelegramAllowedChatIds(): string[] {
  const raw = getSetting("telegram_allowed_chat_ids") ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function setTelegramAllowedChatIds(value: string): void {
  // Normalisér: drop whitespace, slet duplikater, kun cifre + minus (chat_ids kan være negative for groups)
  const list = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s));
  const unique = Array.from(new Set(list));
  setSetting("telegram_allowed_chat_ids", unique.join(","));
}

// --- LLM / Chat ---

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  systemPrompt: string;
  verbose: boolean;
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  baseUrl: "http://localhost:1234/v1",
  apiKey: "lm-studio",
  defaultModel: "",
  systemPrompt:
    "Du er Skynet, en hjælpsom dansk assistent. Svar altid på dansk medmindre andet forespørges.",
  verbose: true,
};

export function getLLMConfig(): LLMConfig {
  return {
    baseUrl: getSetting("llm_base_url") || DEFAULT_LLM_CONFIG.baseUrl,
    apiKey: getSetting("llm_api_key") || DEFAULT_LLM_CONFIG.apiKey,
    defaultModel: getSetting("llm_default_model") || DEFAULT_LLM_CONFIG.defaultModel,
    systemPrompt: getSetting("llm_system_prompt") || DEFAULT_LLM_CONFIG.systemPrompt,
    verbose: (getSetting("llm_verbose") ?? "true") === "true",
  };
}

export function setLLMConfig(partial: Partial<LLMConfig>): void {
  if (partial.baseUrl !== undefined) setSetting("llm_base_url", partial.baseUrl);
  if (partial.apiKey !== undefined) setSetting("llm_api_key", partial.apiKey);
  if (partial.defaultModel !== undefined) setSetting("llm_default_model", partial.defaultModel);
  if (partial.systemPrompt !== undefined) setSetting("llm_system_prompt", partial.systemPrompt);
  if (partial.verbose !== undefined) setSetting("llm_verbose", partial.verbose ? "true" : "false");
}

// --- Notifications ---

export interface NotifyConfig {
  /** macOS Notification Center enabled (kører via osascript) */
  macos: boolean;
  /** ntfy.sh topic — hvis udfyldt sendes push til https://ntfy.sh/<topic> */
  ntfyTopic: string;
  /** Custom ntfy-server (default https://ntfy.sh) */
  ntfyServer: string;
  /** Pushover user-key — hvis udfyldt sendes via Pushover */
  pushoverUser: string;
  /** Pushover app-token */
  pushoverToken: string;
}

export const DEFAULT_NOTIFY_CONFIG: NotifyConfig = {
  macos: true,
  ntfyTopic: "",
  ntfyServer: "https://ntfy.sh",
  pushoverUser: "",
  pushoverToken: "",
};

export function getNotifyConfig(): NotifyConfig {
  return getSettingJSON<NotifyConfig>("notify_config", DEFAULT_NOTIFY_CONFIG);
}

export function setNotifyConfig(partial: Partial<NotifyConfig>): void {
  const current = getNotifyConfig();
  setSettingJSON("notify_config", { ...current, ...partial });
}

// --- Gmail IMAP ---

export interface GmailConfig {
  enabled: boolean;
  /** Gmail-adresse (fx din@gmail.com) */
  user: string;
  /**
   * App password (IKKE dit normale Gmail-password).
   * Opret her: https://myaccount.google.com/apppasswords
   * Kræver 2FA aktiveret på kontoen.
   */
  appPassword: string;
  /** Hvor mange minutter mellem hver triage-poll */
  pollMinutes: number;
  /** Send push om triage-resultat (ellers kun log) */
  notifyOnTriage: boolean;
}

export const DEFAULT_GMAIL_CONFIG: GmailConfig = {
  enabled: false,
  user: "",
  appPassword: "",
  pollMinutes: 15,
  notifyOnTriage: true,
};

export function getGmailConfig(): GmailConfig {
  return getSettingJSON<GmailConfig>("gmail_config", DEFAULT_GMAIL_CONFIG);
}

export function setGmailConfig(partial: Partial<GmailConfig>): void {
  const current = getGmailConfig();
  setSettingJSON("gmail_config", { ...current, ...partial });
}
