"use client";

export interface ChatMetrics {
  /** Time to first token (ms) */
  ttfMs?: number;
  /** Total duration from request start to finish (ms) */
  totalMs?: number;
  /** Prompt tokens (from server usage) */
  promptTokens?: number;
  /** Completion tokens (from server usage) */
  completionTokens?: number;
  /** Tokens/sec during generation */
  tokensPerSec?: number;
  /** Server finish_reason */
  finishReason?: string;
  /** Model id used */
  model?: string;
}

export interface ToolInvocation {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** JSON-stringified resultat fra dispatcher */
  result?: string;
  ok?: boolean;
  blocked?: boolean;
  /** Timestamp ved start */
  startedAt: number;
  /** Timestamp ved resultat */
  endedAt?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  metrics?: ChatMetrics;
  /** Tool-calls udført i denne besked-turn */
  tools?: ToolInvocation[];
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const LS_LIST_KEY = "skynet_chat_conversations"; // array af IDs + metadata
const LS_CONV_PREFIX = "skynet_chat_conv_";
const LS_VERBOSE_KEY = "skynet_chat_verbose";

export interface ConversationIndexEntry {
  id: string;
  title: string;
  updatedAt: number;
  preview: string;
}

function safeLS(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function newConversationId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function newMessageId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function listConversations(): ConversationIndexEntry[] {
  const ls = safeLS();
  if (!ls) return [];
  const raw = ls.getItem(LS_LIST_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as ConversationIndexEntry[];
    return Array.isArray(arr) ? arr.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

export function getConversation(id: string): Conversation | null {
  const ls = safeLS();
  if (!ls) return null;
  const raw = ls.getItem(LS_CONV_PREFIX + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Conversation;
  } catch {
    return null;
  }
}

export function saveConversation(conv: Conversation): void {
  const ls = safeLS();
  if (!ls) return;
  const now = Date.now();
  const updated: Conversation = { ...conv, updatedAt: now };
  ls.setItem(LS_CONV_PREFIX + conv.id, JSON.stringify(updated));
  // opdatér index
  const first = conv.messages.find((m) => m.role === "user");
  const last = conv.messages[conv.messages.length - 1];
  const preview = (last?.content ?? "").slice(0, 80).replace(/\s+/g, " ");
  const title =
    conv.title && conv.title !== "Ny samtale"
      ? conv.title
      : (first?.content ?? "Ny samtale").slice(0, 50).replace(/\s+/g, " ") ||
        "Ny samtale";
  const entry: ConversationIndexEntry = {
    id: conv.id,
    title,
    updatedAt: now,
    preview,
  };
  const list = listConversations().filter((e) => e.id !== conv.id);
  list.unshift(entry);
  ls.setItem(LS_LIST_KEY, JSON.stringify(list.slice(0, 50)));
}

export function deleteConversation(id: string): void {
  const ls = safeLS();
  if (!ls) return;
  ls.removeItem(LS_CONV_PREFIX + id);
  const list = listConversations().filter((e) => e.id !== id);
  ls.setItem(LS_LIST_KEY, JSON.stringify(list));
}

export function latestConversation(): Conversation | null {
  const list = listConversations();
  if (list.length === 0) return null;
  return getConversation(list[0].id);
}

export interface GlobalChatStats {
  totalMessages: number;
  totalCompletionTokens: number;
  totalPromptTokens: number;
  /** Gennemsnit af tokensPerSec over de sidste 10 assistant-beskeder med metrics */
  avgTokensPerSec: number | null;
  /** Seneste assistant-beskeds metrics */
  latest: ChatMetrics | null;
  /** Seneste 3 unikke modeller brugt, nyeste først */
  recentModels: string[];
  conversationCount: number;
}

export function getGlobalChatStats(): GlobalChatStats {
  const stats: GlobalChatStats = {
    totalMessages: 0,
    totalCompletionTokens: 0,
    totalPromptTokens: 0,
    avgTokensPerSec: null,
    latest: null,
    recentModels: [],
    conversationCount: 0,
  };
  const list = listConversations();
  stats.conversationCount = list.length;

  // Saml alle assistant-beskeder med metrics, nyeste først
  const assistantMsgs: Array<{ createdAt: number; metrics: ChatMetrics }> = [];
  for (const entry of list) {
    const conv = getConversation(entry.id);
    if (!conv) continue;
    for (const m of conv.messages) {
      if (m.role !== "assistant") continue;
      stats.totalMessages += 1;
      if (m.metrics) {
        if (m.metrics.completionTokens != null)
          stats.totalCompletionTokens += m.metrics.completionTokens;
        if (m.metrics.promptTokens != null)
          stats.totalPromptTokens += m.metrics.promptTokens;
        assistantMsgs.push({ createdAt: m.createdAt, metrics: m.metrics });
      }
    }
  }

  assistantMsgs.sort((a, b) => b.createdAt - a.createdAt);

  if (assistantMsgs.length > 0) stats.latest = assistantMsgs[0].metrics;

  // Gennemsnitlig tok/s over de sidste 10 der har tokensPerSec
  const recentTps = assistantMsgs
    .slice(0, 10)
    .map((m) => m.metrics.tokensPerSec)
    .filter((t): t is number => t != null && isFinite(t));
  if (recentTps.length > 0) {
    stats.avgTokensPerSec =
      recentTps.reduce((s, t) => s + t, 0) / recentTps.length;
  }

  // Seneste 3 unikke modeller
  const seen = new Set<string>();
  for (const m of assistantMsgs) {
    const id = m.metrics.model;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    stats.recentModels.push(id);
    if (stats.recentModels.length >= 3) break;
  }

  return stats;
}

export function getVerbose(defaultVal = true): boolean {
  const ls = safeLS();
  if (!ls) return defaultVal;
  const v = ls.getItem(LS_VERBOSE_KEY);
  if (v === null) return defaultVal;
  return v === "true";
}

export function setVerbose(v: boolean): void {
  const ls = safeLS();
  if (!ls) return;
  ls.setItem(LS_VERBOSE_KEY, v ? "true" : "false");
}
