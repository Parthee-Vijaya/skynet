"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import "xterm/css/xterm.css";

/**
 * Terminal-side — xterm.js attached til tmux via WebSocket (port 3101).
 *
 * Bruger control_token (hentes fra /api/control/token) for at autentikere
 * WS-forbindelsen. Samme session som du ville se via Termius/SSH — ændringer
 * synkroniserer live i begge ender.
 */

function TerminalInner() {
  const params = useSearchParams();
  const session = params.get("session") ?? "agents";
  const elRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!elRef.current) return;

    let ws: WebSocket | null = null;
    let cleanup: (() => void) | null = null;

    (async () => {
      // Dynamisk import af xterm for at undgå SSR-issues
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("xterm"),
        import("@xterm/addon-fit"),
      ]);

      const term = new Terminal({
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        cursorBlink: true,
        scrollback: 5000,
        convertEol: true,
        theme: {
          background: "#0a0a0a",
          foreground: "#e5e5e5",
          cursor: "#9bd0ff",
          cursorAccent: "#0a0a0a",
          selectionBackground: "#264f78",
          black: "#0a0a0a",
          red: "#d87373",
          green: "#7dd67d",
          yellow: "#e6b450",
          blue: "#9bd0ff",
          magenta: "#c4b5fd",
          cyan: "#a5f3fc",
          white: "#e5e5e5",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      if (!elRef.current) {
        term.dispose();
        return;
      }
      term.open(elRef.current);

      // Vent til container har målbar størrelse
      await new Promise((r) => requestAnimationFrame(r));
      try { fit.fit(); } catch { /* noop */ }

      // Hent control-token via same-origin (browser sender Origin → tillades)
      let token = "";
      try {
        const r = await fetch("/api/control/token", { cache: "no-store" });
        if (r.ok) {
          const data = await r.json() as { token?: string };
          token = data.token ?? "";
        }
      } catch { /* noop */ }
      if (!token) {
        setStatus("error");
        setErrorMsg("kunne ikke hente control-token — check /api/control/token");
        return;
      }

      const { cols, rows } = term;
      const host = window.location.hostname;
      const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${wsProto}://${host}:3101/terminal?session=${encodeURIComponent(session)}&cols=${cols}&rows=${rows}&token=${encodeURIComponent(token)}`;

      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        setStatus("connected");
      };
      ws.onmessage = (e) => {
        if (typeof e.data === "string") {
          term.write(e.data);
        } else if (e.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(e.data));
        }
      };
      ws.onclose = (e) => {
        setStatus("disconnected");
        if (e.reason) setErrorMsg(e.reason);
      };
      ws.onerror = () => {
        setStatus("error");
        setErrorMsg("WebSocket-fejl — er portalen genstartet?");
      };

      term.onData((d) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ t: "input", d }));
        }
      });
      term.onResize(({ cols, rows }) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ t: "resize", cols, rows }));
        }
      });

      const onResize = () => {
        try { fit.fit(); } catch { /* noop */ }
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        try { ws?.close(); } catch { /* noop */ }
        try { term.dispose(); } catch { /* noop */ }
      };
    })();

    return () => {
      cleanup?.();
    };
  }, [session]);

  return (
    <MinimalPageLayout active="terminal">
      <div className="px-4 py-2 md:px-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <div className="flex items-baseline justify-between text-[10px] text-neutral-500 mb-2">
          <span>
            session: <span className="text-neutral-200">{session}</span>
          </span>
          <span
            style={{
              color:
                status === "connected" ? "#7dd67d"
                : status === "error" ? "#d87373"
                : status === "connecting" ? "#e6b450"
                : "#6b6b6b",
            }}
          >
            ● {status}
            {errorMsg ? ` · ${errorMsg}` : ""}
          </span>
        </div>
        <div
          ref={elRef}
          style={{
            height: "calc(100vh - 110px)",
            background: "#0a0a0a",
            border: "1px solid #1c1c1c",
            padding: 6,
            overflow: "hidden",
          }}
        />
        <div className="mt-2 text-[10px] text-neutral-700 flex flex-wrap gap-x-4 gap-y-1">
          <span>⌃B d = detach</span>
          <span>⌃B c = nyt vindue</span>
          <span>⌃B n/p = næste/forrige</span>
          <span>⌃B [ = scroll-mode (q for exit)</span>
        </div>
      </div>
    </MinimalPageLayout>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={<div className="p-6 text-neutral-500">indlæser…</div>}>
      <TerminalInner />
    </Suspense>
  );
}
