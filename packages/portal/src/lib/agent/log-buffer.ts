/**
 * In-memory ring buffer for agent/automation log entries.
 * SSE subscribers can stream real-time logs as automations run.
 */

export type LogLevel = "info" | "ok" | "error" | "warn" | "tool";

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  message: string;
  automationId?: number;
  automationName?: string;
  tool?: string;
}

const MAX_SIZE = 500;
const buffer: LogEntry[] = [];
let seq = 0;

// SSE subscriber map: id → callback
type Subscriber = (entry: LogEntry) => void;
const subscribers = new Map<string, Subscriber>();

export function appendLog(
  level: LogLevel,
  message: string,
  meta?: { automationId?: number; automationName?: string; tool?: string }
): LogEntry {
  const entry: LogEntry = {
    id: ++seq,
    ts: Date.now(),
    level,
    message,
    ...meta,
  };

  buffer.push(entry);
  if (buffer.length > MAX_SIZE) buffer.shift();

  // Notify all SSE subscribers
  for (const cb of subscribers.values()) {
    try { cb(entry); } catch { /* noop */ }
  }

  return entry;
}

export function getRecentLogs(n = 100): LogEntry[] {
  return buffer.slice(-n);
}

export function subscribeToLogs(id: string, cb: Subscriber): () => void {
  subscribers.set(id, cb);
  return () => subscribers.delete(id);
}
