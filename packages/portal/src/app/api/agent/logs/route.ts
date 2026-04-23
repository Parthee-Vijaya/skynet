/**
 * GET /api/agent/logs
 *
 * SSE stream of agent/automation log entries. On connect, sends the last
 * 100 buffered entries, then streams new ones as they arrive.
 *
 * ?tail=N  → only send last N entries on connect (default 100)
 */

import { getRecentLogs, subscribeToLogs } from "@/lib/agent/log-buffer";
import type { LogEntry } from "@/lib/agent/log-buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tail = Math.min(500, Math.max(1, parseInt(url.searchParams.get("tail") ?? "100")));

  const encoder = new TextEncoder();
  const subId = `sse_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const stream = new ReadableStream({
    start(controller) {
      const send = (entry: LogEntry) => {
        try {
          const data = `data: ${JSON.stringify(entry)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // client disconnected
        }
      };

      // Flush recent history
      const recent = getRecentLogs(tail);
      for (const entry of recent) send(entry);

      // Subscribe to new entries
      const unsub = subscribeToLogs(subId, send);

      // Cleanup when client disconnects
      req.signal.addEventListener("abort", () => {
        unsub();
        try { controller.close(); } catch { /* noop */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
