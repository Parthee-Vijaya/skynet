/**
 * Gmail IMAP-integration.
 *
 * Bruger Gmail app-password (ikke OAuth) for enkelhed og fordi brugeren
 * selv styrer credentials lokalt. App-password skal oprettes på:
 * https://myaccount.google.com/apppasswords (kræver 2FA).
 *
 * Read-only: vi henter og læser mails, men sender/sletter ALDRIG.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getGmailConfig } from "../settings";

export interface MailSummary {
  uid: number;
  from: string;
  fromEmail: string;
  subject: string;
  date: string; // ISO
  snippet: string;
  /** Ren tekst-body (trunkeret til ~2000 tegn) */
  text?: string;
  unread: boolean;
}

export async function isConfigured(): Promise<boolean> {
  const cfg = getGmailConfig();
  return !!(cfg.user && cfg.appPassword && cfg.enabled);
}

/**
 * Test IMAP-credentials. Returnerer ok + antal mails i INBOX hvis succes.
 */
export async function testConnection(): Promise<{
  ok: boolean;
  message: string;
  total?: number;
}> {
  const cfg = getGmailConfig();
  if (!cfg.user || !cfg.appPassword) {
    return { ok: false, message: "Gmail user eller app-password mangler" };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: cfg.user, pass: cfg.appPassword },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const status = await client.status("INBOX", { messages: true });
      return {
        ok: true,
        message: `Forbundet til ${cfg.user}`,
        total: status.messages ?? 0,
      };
    } finally {
      lock.release();
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

/**
 * Hent de seneste N ulæste mails fra INBOX.
 */
export async function fetchRecentUnread(limit = 20): Promise<MailSummary[]> {
  const cfg = getGmailConfig();
  if (!cfg.user || !cfg.appPassword) {
    throw new Error("Gmail er ikke konfigureret");
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: cfg.user, pass: cfg.appPassword },
    logger: false,
  });

  const results: MailSummary[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Find ulæste UIDs — seneste N først
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return [];
      const recent = uids.slice(-limit).reverse();

      for await (const msg of client.fetch(
        recent,
        { envelope: true, source: true, flags: true },
        { uid: true }
      )) {
        const env = msg.envelope;
        if (!env) continue;
        const from = env.from?.[0];
        const fromName = from?.name || from?.address || "(ukendt)";
        const fromEmail = from?.address || "";

        let text = "";
        let snippet = "";
        try {
          if (msg.source) {
            const parsed = await simpleParser(msg.source);
            text = (parsed.text || "").trim().slice(0, 2000);
            snippet = text.replace(/\s+/g, " ").slice(0, 180);
          }
        } catch {
          // ignorer parse-fejl
        }

        results.push({
          uid: Number(msg.uid),
          from: fromName,
          fromEmail,
          subject: env.subject || "(ingen emne)",
          date: env.date ? new Date(env.date).toISOString() : new Date().toISOString(),
          snippet,
          text,
          unread: !msg.flags?.has("\\Seen"),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }

  return results;
}
