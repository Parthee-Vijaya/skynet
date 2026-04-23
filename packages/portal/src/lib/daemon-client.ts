/**
 * Server-side daemon client for portal API routes.
 * Connects to the Skynet daemon via WebSocket, sends a request, and waits for the response.
 */

import { DAEMON_WS_URL } from "./daemon-config";
import WebSocket from "ws";

interface DaemonRequest {
  type: string;
  [key: string]: unknown;
}

/**
 * Send a single request to the daemon and return the first matching response.
 * Opens a WS connection, sends the message, waits for response, then closes.
 */
export async function daemonRequest<T = unknown>(
  req: DaemonRequest,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DAEMON_WS_URL);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Daemon request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify(req));
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // Response types typically match request type with _response suffix
        const expectedType = req.type.replace("_request", "_response");
        if (msg.type === expectedType || msg.type === "status") {
          clearTimeout(timer);
          ws.close();
          resolve(msg as T);
        }
      } catch {
        // ignore parse errors, wait for valid response
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
 * Check if daemon is online by attempting a quick WS connection.
 */
export async function isDaemonOnline(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(DAEMON_WS_URL);
    const timer = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 2000);

    ws.on("open", () => {
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
