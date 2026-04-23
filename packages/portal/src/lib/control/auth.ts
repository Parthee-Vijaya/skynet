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
 * Browseren sender Origin-header ved cross-origin fetch — hvis den matcher
 * serverens Host, er det OS's egen browser.
 */
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!host) return false;
  // Ingen Origin = server-to-server (fx curl) → ikke same-origin
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
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
