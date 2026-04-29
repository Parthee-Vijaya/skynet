/**
 * Anti-loop helpers til iMessage inbound/outbound flow.
 *
 * Problemstilling: når Skynet sender en iMessage tilbage via send_imessage,
 * dukker beskeden op i ~/Library/Messages/chat.db igen — ofte med
 * is_from_me=0 hvis afsender er brugerens egen iCloud-konto (sync mellem
 * Mac/iPhone). Polleren ville så fodre Skynets eget svar tilbage til LLM'en
 * og starte en uendelig løkke.
 *
 * To beskyttelseslag:
 *
 *   1. recordSentReply(to, text) — kaldes hver gang inbound-handleren har
 *      sendt et svar. Polleren tjekker isEchoOfRecentReply(handleId, text)
 *      og skipper match indenfor 10 minutter.
 *
 *   2. tryAcquireInbound(handleId) / releaseInbound(handleId) — semaphore
 *      pr. afsender. Hvis vi allerede behandler en besked fra dette nummer,
 *      ignorer nye indtil vi er færdige (forhindrer race ved hurtig
 *      duplicate-trigger fra retry/burst).
 */

const RECENT_REPLY_TTL_MS = 10 * 60 * 1000; // 10 min
const recentReplies = new Map<string, number>();
const inFlight = new Set<string>();

function normalizeRecipient(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

function normalizeText(s: string): string {
  // Trim, normalisér whitespace + diakritiske tegn for at matche selv hvis
  // chat.db har tilføjet usynlige tegn eller unicode-varianter
  return s.replace(/\s+/g, " ").trim();
}

function key(to: string, text: string): string {
  return `${normalizeRecipient(to)}|${normalizeText(text)}`;
}

function gc(): void {
  const cutoff = Date.now() - RECENT_REPLY_TTL_MS;
  for (const [k, ts] of recentReplies) {
    if (ts < cutoff) recentReplies.delete(k);
  }
}

/** Registrer at vi netop har sendt 'text' til 'to' via send_imessage */
export function recordSentReply(to: string, text: string): void {
  recentReplies.set(key(to, text), Date.now());
  gc();
}

/**
 * Returnerer true hvis (handleId, text) matcher en besked vi netop har
 * sendt — så er det et echo og skal skippes af polleren.
 */
export function isEchoOfRecentReply(handleId: string, text: string): boolean {
  gc();
  return recentReplies.has(key(handleId, text));
}

/**
 * Forsøg at låse en sender. Returnerer false hvis vi allerede behandler en
 * besked fra dette nummer. Husk at kalde releaseInbound() i finally.
 */
export function tryAcquireInbound(handleId: string): boolean {
  const k = normalizeRecipient(handleId);
  if (inFlight.has(k)) return false;
  inFlight.add(k);
  return true;
}

export function releaseInbound(handleId: string): void {
  inFlight.delete(normalizeRecipient(handleId));
}

/** Test-only: ryd state mellem unit-tests */
export function _resetLoopGuard(): void {
  recentReplies.clear();
  inFlight.clear();
}
