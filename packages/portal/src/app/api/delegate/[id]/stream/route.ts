import { NextRequest } from "next/server";
import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { getTask, getLogPath, isRunning } from "@/lib/delegate/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent-Events-agtig stream af task-log + status. Hver event er en linje
 * JSON med { type, data }. UI'en kan lytte via fetch + ReadableStream.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) return Response.json({ error: "not found" }, { status: 404 });

  const logPath = getLogPath(id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      send({ type: "status", data: task });

      // Læs eksisterende log først
      let lastSize = 0;
      if (logPath && existsSync(logPath)) {
        const st = statSync(logPath);
        lastSize = st.size;
        await new Promise<void>((resolve) => {
          const rs = createReadStream(logPath, { encoding: "utf8" });
          rs.on("data", (c) => {
            const text = typeof c === "string" ? c : c.toString("utf8");
            send({ type: "log", data: text });
          });
          rs.on("end", () => resolve());
          rs.on("error", () => resolve());
        });
      }

      // Hvis task ikke kører mere → send done + luk
      if (!isRunning(id)) {
        const final = getTask(id);
        send({ type: "status", data: final });
        send({ type: "end" });
        controller.close();
        return;
      }

      // Ellers watch log-filen for nye bytes
      let closed = false;
      const w = logPath
        ? watch(logPath, async () => {
            if (closed || !logPath) return;
            try {
              const st = statSync(logPath);
              if (st.size > lastSize) {
                const rs = createReadStream(logPath, {
                  start: lastSize,
                  end: st.size - 1,
                  encoding: "utf8",
                });
                lastSize = st.size;
                rs.on("data", (c) => {
                  const text = typeof c === "string" ? c : c.toString("utf8");
                  send({ type: "log", data: text });
                });
              }
            } catch {
              // ignore
            }
          })
        : null;

      // Poll status hvert 2. sek
      const statusPoll = setInterval(() => {
        const t = getTask(id);
        if (!t) return;
        send({ type: "status", data: t });
        if (!isRunning(id)) {
          clearInterval(statusPoll);
          w?.close();
          closed = true;
          // Flush evt. sidste data
          setTimeout(() => {
            send({ type: "end" });
            try {
              controller.close();
            } catch {
              // already closed
            }
          }, 500);
        }
      }, 2000);

      // Hvis client disconnecter
      const abort = () => {
        closed = true;
        clearInterval(statusPoll);
        w?.close();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      // NB: Next's signal handling — vi stoler på GC
      void abort;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
