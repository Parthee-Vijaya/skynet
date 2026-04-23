/**
 * Server-side daemon client for portal API routes.
 *
 * Protocol:
 *   1. Connect to ws://host:port/ws
 *   2. Send { type: "hello", clientId, clientType, protocolVersion: 1 }
 *   3. Wait for any server message (capabilities / pong)
 *   4. Wrap requests as { type: "session", message: <req> }
 *   5. Unwrap responses from { type: "session", message: <res> }
 */

import { DAEMON_HOST, DAEMON_PORT } from "./daemon-config";
import WebSocket from "ws";
import { randomUUID } from "crypto";

const PROTOCOL_VERSION = 1;

interface DaemonRequest {
  type: string;
  [key: string]: unknown;
}

function makeHello() {
  return JSON.stringify({
    type: "hello",
    clientId: `skynet-portal-${randomUUID().slice(0, 8)}`,
    clientType: "browser",
    protocolVersion: PROTOCOL_VERSION,
  });
}

/**
 * Send a session request to the daemon and return the first matching response.
 */
export async function daemonRequest<T = unknown>(
  req: DaemonRequest,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${DAEMON_HOST}:${DAEMON_PORT}/ws`);
    let requestSent = false;

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Daemon request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(makeHello());
    });

    ws.on("message", (data) => {
      try {
        const outer = JSON.parse(data.toString());

        // Server responds to hello with {type:"session", message:{type:"status",...}}
        // That's our signal to send the actual request.
        if (
          !requestSent &&
          outer.type === "session" &&
          outer.message?.type === "status"
        ) {
          requestSent = true;
          ws.send(
            JSON.stringify({
              type: "session",
              message: { ...req, requestId: req.requestId ?? randomUUID() },
            }),
          );
          return;
        }

        // Session response: unwrap and match
        if (outer.type === "session" && outer.message) {
          const msg = outer.message as { type: string };
          const expectedType = req.type.replace("_request", "_response");
          if (msg.type === expectedType) {
            clearTimeout(timer);
            ws.close();
            resolve(msg as T);
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on("close", () => {
      clearTimeout(timer);
    });
  });
}

/**
 * Check if daemon is online by connecting + sending hello and waiting for any server response.
 */
export async function isDaemonOnline(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${DAEMON_HOST}:${DAEMON_PORT}/ws`);
    const timer = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 2000);

    ws.on("open", () => {
      ws.send(makeHello());
    });

    ws.on("message", () => {
      clearTimeout(timer);
      ws.close();
      resolve(true);
    });

    ws.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
