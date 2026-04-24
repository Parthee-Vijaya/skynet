import { randomBytes } from "node:crypto";
import { getSetting, setSetting } from "../settings";

/**
 * Control API-autorisation.
 *
 * To måder at authentikere:
 *   1. Same-origin request (browser-widget på localhost:3100) → auto-tillad
 *   2. Bearer token i Authorization-header → match mod control_token
 *
 * Tokenet gemmes i settings og genereres tilfældigt ved første adgang.
 */

export function getControlToken(): string {
  let t = getSetting("control_token");
  if (!t) {
    t = randomBytes(24).toString("base64url");
    setSetting("control_token", t);
  }
  return t;
}

export function rotateControlToken(): string {
  const t = randomBytes(24).toString("base64url");
  setSetting("control_token", t);
  return t;
}

/**
 * Tjek om request er same-origin (lokal widget vs LAN-klient).
 *
 * Browseren sender IKKE Origin-header ved same-origin GET/HEAD requests
 * (MDN: "Origin is sent for cross-origin requests as well as same-origin,
 * but not for same-origin GET or HEAD requests").
 *
 * Vi accepterer derfor:
 *   1. Origin matcher Host (cross-origin fetch fra egen app)
 *   2. Referer matcher Host (same-origin GET uden Origin)
 *   3. Ingen Origin OG ingen Referer OG ingen User-Agent fra curl — lader vi
 *      passere hvis request er GET, da det er read-only og stadig
 *      authenticated ved Host-check for API-endpoints der rammer localhost
 *
 * curl/CLI (uden browser) sender ingen af disse → bliver afvist → token
 * -auth bruges som fallback.
 */
function isSameOrigin(req: Request): boolean {
  const host = req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host === host) return true;
    } catch { /* ugyldig URL → fortsæt til referer-check */ }
  }

  // Fallback: same-origin GET/HEAD kommer uden Origin men med Referer
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).host === host) return true;
    } catch { /* ugyldig URL */ }
  }

  return false;
}

export interface AuthResult {
  ok: boolean;
  reason?: string;
  via?: "same-origin" | "token";
}

export function authorize(req: Request): AuthResult {
  if (isSameOrigin(req)) {
    return { ok: true, via: "same-origin" };
  }

  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const supplied = auth.slice(7).trim();
    const expected = getControlToken();
    if (supplied === expected) {
      return { ok: true, via: "token" };
    }
    return { ok: false, reason: "invalid token" };
  }

  return { ok: false, reason: "missing authorization" };
}

export function requireAuth(req: Request): Response | null {
  const res = authorize(req);
  if (res.ok) return null;
  return new Response(JSON.stringify({ error: res.reason ?? "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
