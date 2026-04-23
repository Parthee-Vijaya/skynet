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
  /** Gmail-adresse (fx parti.vijaya1@gmail.com) */
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
