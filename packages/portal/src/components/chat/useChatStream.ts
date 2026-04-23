"use client";
import { useCallback, useRef, useState } from "react";
import type { ChatMessage, ChatMetrics, ToolInvocation } from "@/lib/chat-storage";
import { newMessageId } from "@/lib/chat-storage";

interface SendOpts {
  model: string;
  systemPrompt: string;
  /** Tillad destruktive tool-actions (stop/restart/quit). Default false. */
  confirmDestructive?: boolean;
}

export interface UseChatStreamResult {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  send: (userText: string, opts: SendOpts) => Promise<void>;
  stop: () => void;
  status: "idle" | "streaming" | "error";
  error: string | null;
}

export function useChatStream(
  initialMessages: ChatMessage[] = []
): UseChatStreamResult {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  const send = useCallback(
    async (userText: string, opts: SendOpts) => {
      setError(null);
      const userMsg: ChatMessage = {
        id: newMessageId(),
        role: "user",
        content: userText,
        createdAt: Date.now(),
      };
      const assistantMsg: ChatMessage = {
        id: newMessageId(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        metrics: { model: opts.model },
      };

      // Snap messages lokalt til at sende til server
      const history = [...messages, userMsg].map(({ role, content }) => ({
        role,
        content,
      }));

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStatus("streaming");

      const ac = new AbortController();
      abortRef.current = ac;
      const startedAt = performance.now();
      let firstTokenAt: number | null = null;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            model: opts.model,
            systemPrompt: opts.systemPrompt,
            tools: true,
            confirmDestructive: opts.confirmDestructive === true,
          }),
          signal: ac.signal,
        });

        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          let errMsg = txt;
          try {
            const obj = JSON.parse(txt) as { error?: string };
            if (obj.error) errMsg = obj.error;
          } catch {
            /* noop */
          }
          throw new Error(errMsg || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let collected = "";
        const toolInvocations: ToolInvocation[] = [];
        let usage:
          | {
              prompt_tokens?: number;
              completion_tokens?: number;
            }
          | null = null;
        let finishReason: string | undefined;

        const updateAssistant = (patch: Partial<ChatMessage>) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.id === assistantMsg.id) {
              copy[copy.length - 1] = { ...last, ...patch };
            }
            return copy;
          });
        };

        // Eslint-disable: while(true) er bevidst — bryder på reader done/err
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              const ev = JSON.parse(line) as
                | { type: "delta"; text: string }
                | {
                    type: "usage";
                    usage: { prompt_tokens?: number; completion_tokens?: number };
                  }
                | { type: "done"; finishReason: string }
                | { type: "error"; message: string }
                | {
                    type: "tool_call";
                    id: string;
                    name: string;
                    args: Record<string, unknown>;
                  }
                | {
                    type: "tool_result";
                    id: string;
                    name: string;
                    ok: boolean;
                    blocked?: boolean;
                    content: string;
                  };

              if (ev.type === "delta") {
                if (firstTokenAt == null) firstTokenAt = performance.now();
                collected += ev.text;
                updateAssistant({ content: collected });
              } else if (ev.type === "usage") {
                usage = ev.usage;
              } else if (ev.type === "done") {
                finishReason = ev.finishReason;
              } else if (ev.type === "tool_call") {
                toolInvocations.push({
                  id: ev.id,
                  name: ev.name,
                  args: ev.args,
                  startedAt: Date.now(),
                });
                updateAssistant({ tools: [...toolInvocations] });
              } else if (ev.type === "tool_result") {
                const inv = toolInvocations.find((t) => t.id === ev.id);
                if (inv) {
                  inv.ok = ev.ok;
                  inv.blocked = ev.blocked;
                  inv.result = ev.content;
                  inv.endedAt = Date.now();
                }
                updateAssistant({ tools: [...toolInvocations] });
              } else if (ev.type === "error") {
                throw new Error(ev.message);
              }
            } catch (e) {
              if (e instanceof Error && e.message) {
                throw e;
              }
            }
          }
        }

        // Beregn metrics
        const endedAt = performance.now();
        const ttfMs =
          firstTokenAt != null ? Math.round(firstTokenAt - startedAt) : undefined;
        const totalMs = Math.round(endedAt - startedAt);
        const completionTokens = usage?.completion_tokens;
        const generationMs =
          firstTokenAt != null ? endedAt - firstTokenAt : endedAt - startedAt;
        const tokensPerSec =
          completionTokens != null && generationMs > 0
            ? completionTokens / (generationMs / 1000)
            : undefined;
        const metrics: ChatMetrics = {
          model: opts.model,
          ttfMs,
          totalMs,
          promptTokens: usage?.prompt_tokens,
          completionTokens,
          tokensPerSec,
          finishReason,
        };

        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.id === assistantMsg.id) {
            copy[copy.length - 1] = {
              ...last,
              content: collected,
              metrics,
              tools: toolInvocations.length > 0 ? [...toolInvocations] : undefined,
            };
          }
          return copy;
        });
        setStatus("idle");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (ac.signal.aborted) {
          // Afbrudt af bruger — behold hvad vi har
          setStatus("idle");
          return;
        }
        setError(msg);
        setStatus("error");
        // Marker assistant-msg med fejl
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.id === assistantMsg.id) {
            copy[copy.length - 1] = {
              ...last,
              content: last.content || `⚠ Fejl: ${msg}`,
              metrics: { ...last.metrics, finishReason: "error" },
            };
          }
          return copy;
        });
      } finally {
        abortRef.current = null;
      }
    },
    [messages]
  );

  return { messages, setMessages, send, stop, status, error };
}
