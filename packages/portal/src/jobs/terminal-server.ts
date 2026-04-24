/**
 * WebSocket-server til xterm.js-baseret browser-terminal.
 *
 * Kører på port 3101 i samme Node-proces som Next.js (startet fra
 * instrumentation.ts). Spawner `tmux new-session -A -s <session>` i en
 * node-pty og proxy'er stdin/stdout/resize over WebSocket.
 *
 * Auth: token-baseret (genbrug af control_token). Token hentes fra klienten
 * via GET /api/control/token (same-origin kræver ingen ekstra auth).
 *
 * Bindes til 0.0.0.0 så Tailscale + LAN-klienter (fx iPhone PWA) kan nå den.
 */

import { IPty } from "node-pty";
import type { WebSocket } from "ws";
import { getControlToken } from "@/lib/control/auth";

const WS_PORT = Number(process.env.SKYNET_TERMINAL_PORT ?? 3101);
const SESSION_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Start WS-server. Kaldes fra instrumentation.ts — idempotent. */
let started = false;
export async function startTerminalServer(): Promise<void> {
  if (started) return;
  started = true;

  // Dynamisk import så native-moduler (node-pty) kun indlæses på Node-runtime
  const [{ WebSocketServer }, pty] = await Promise.all([
    import("ws"),
    import("node-pty"),
  ]);

  const wss = new WebSocketServer({ port: WS_PORT, path: "/terminal" });

  wss.on("listening", () => {
    console.log(`[terminal-ws] lytter på :${WS_PORT}/terminal`);
  });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const session = url.searchParams.get("session") ?? "agents";
    const cols = Math.min(500, Math.max(10, parseInt(url.searchParams.get("cols") ?? "80", 10) || 80));
    const rows = Math.min(200, Math.max(5, parseInt(url.searchParams.get("rows") ?? "24", 10) || 24));
    const token = url.searchParams.get("token");

    // Valider session-navn for at undgå at tmux tager argumenter som flags
    if (!SESSION_NAME_RE.test(session)) {
      ws.close(1008, "invalid session name");
      return;
    }

    // Token-auth
    if (token !== getControlToken()) {
      ws.close(1008, "unauthorized");
      return;
    }

    let term: IPty;
    try {
      term = pty.spawn("tmux", ["new-session", "-A", "-s", session], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: process.env.HOME ?? "/",
        env: process.env as Record<string, string>,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ws.send(JSON.stringify({ t: "error", d: `kunne ikke starte tmux: ${msg}` }));
      ws.close(1011, "pty-spawn-failed");
      return;
    }

    // pty → WS
    term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });
    term.onExit(({ exitCode, signal }) => {
      try {
        ws.close(1000, `pty exited (code=${exitCode}, signal=${signal ?? "-"})`);
      } catch { /* noop */ }
    });

    // WS → pty
    ws.on("message", (raw) => {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      // Protokol: {t:'input',d:'...'} | {t:'resize',cols,rows}
      // Binary-less for enkelhed — alt er JSON
      let msg: { t?: string; d?: string; cols?: number; rows?: number };
      try {
        msg = JSON.parse(text);
      } catch {
        // Tillad også rå input som string (fallback for enkelthed)
        term.write(text);
        return;
      }
      if (msg.t === "input" && typeof msg.d === "string") {
        term.write(msg.d);
      } else if (msg.t === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
        const c = Math.min(500, Math.max(10, msg.cols | 0));
        const r = Math.min(200, Math.max(5, msg.rows | 0));
        try { term.resize(c, r); } catch { /* noop */ }
      }
    });

    ws.on("close", () => {
      try { term.kill(); } catch { /* noop */ }
    });

    ws.on("error", () => {
      try { term.kill(); } catch { /* noop */ }
    });
  });

  wss.on("error", (err) => {
    console.error("[terminal-ws] error:", err);
  });
}

// Lokal type-import til IPty når node-pty bruges i function-signatures
declare module "node-pty" {}
