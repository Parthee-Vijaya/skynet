"use client";
import { useEffect, useRef, useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import { Section, Dot } from "../primitives";
import type { ConversationResponse } from "@/app/api/telegram/conversation/route";
import { timeSince } from "@/lib/formatters";

/**
 * Telegram conversation-widget — cockpit-stream af sidste N inbound +
 * outbound beskeder + reply-input. Henter fra /api/telegram/conversation
 * (poll 10s) og POSTer til samme endpoint for at sende manuel reply.
 *
 * Når intet er konfigureret viser den en kort hjælpetekst og link til
 * /automations setup-tab.
 */
export function TelegramWidget() {
  const { data, error } = usePoll<ConversationResponse>("/api/telegram/conversation?limit=20", 10_000);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll til bund når nye beskeder kommer ind
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.messages?.length]);

  // Vælg første chat automatisk når data lander
  useEffect(() => {
    if (!activeChat && data?.chats && data.chats.length > 0) {
      setActiveChat(data.chats[0].chatId);
    }
  }, [data?.chats, activeChat]);

  const messages = activeChat
    ? (data?.messages ?? []).filter((m) => m.chatId === activeChat)
    : (data?.messages ?? []);

  const right = !data ? (
    <span>indlæser…</span>
  ) : !data.configured ? (
    <span className="text-[#e6b450]"><Dot tone="warn" />ikke opsat</span>
  ) : data.chats.length === 0 ? (
    <span className="text-neutral-600">ingen samtaler endnu</span>
  ) : (
    <span>
      <Dot tone="ok" />
      {data.chats.length} chat{data.chats.length !== 1 ? "s" : ""} · {data.messages.length} besked{data.messages.length !== 1 ? "er" : ""}
    </span>
  );

  async function sendReply() {
    if (!activeChat || !draft.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/telegram/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: activeChat, text: draft.trim() }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setSendError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setDraft("");
      // Næste poll henter den friske samtale, men trigger en ekstra fetch lige nu
      // ved blot at vente til usePoll roterer (10s er fint)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void sendReply();
    }
  }

  return (
    <Section title="telegram" right={right} className="col-span-12 lg:col-span-6">
      {error ? (
        <div className="font-mono text-[11px] text-[#d87373]">fejl: {error.message}</div>
      ) : !data ? (
        <div className="font-mono text-[12px] text-neutral-700">indlæser…</div>
      ) : !data.configured ? (
        <div className="font-mono text-[11px] text-neutral-600 space-y-2">
          <div>Telegram-bot er ikke opsat endnu.</div>
          <div className="text-neutral-700">
            Konfigurér token + allowlist på{" "}
            <a href="/automations" className="text-sky-400 hover:text-sky-300">/automations → setup</a>.
          </div>
        </div>
      ) : data.chats.length === 0 ? (
        <div className="font-mono text-[11px] text-neutral-600 leading-relaxed">
          <div>Ingen samtaler endnu — skriv til botten i Telegram, så dukker de op her.</div>
        </div>
      ) : (
        <div className="font-mono">
          {/* Chat-vælger (kun synlig når der er flere) */}
          {data.chats.length > 1 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1 -mx-1 px-1">
              {data.chats.map((c) => {
                const isActive = c.chatId === activeChat;
                return (
                  <button
                    key={c.chatId}
                    onClick={() => setActiveChat(c.chatId)}
                    className={
                      "shrink-0 px-2 py-0.5 text-[10px] tabular-nums border " +
                      (isActive
                        ? "border-neutral-600 text-neutral-200"
                        : "border-neutral-900 text-neutral-600 hover:text-neutral-400")
                    }
                  >
                    {c.chatId}
                  </button>
                );
              })}
            </div>
          )}

          {/* Besked-stream */}
          <div
            ref={scrollRef}
            className="text-[11px] space-y-1.5 max-h-[180px] overflow-y-auto pr-1 leading-snug"
          >
            {messages.length === 0 ? (
              <div className="text-neutral-700">— ingen beskeder i denne chat endnu —</div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="flex gap-2">
                  <span
                    className={
                      "shrink-0 w-12 text-[10px] uppercase tracking-wider tabular-nums " +
                      (m.direction === "in" ? "text-neutral-500" : "text-sky-500/70")
                    }
                  >
                    {m.direction === "in" ? m.sender ?? "in" : "skynet"}
                  </span>
                  <span
                    className={
                      "min-w-0 flex-1 break-words " +
                      (m.direction === "in" ? "text-neutral-200" : "text-neutral-400")
                    }
                  >
                    {m.text}
                    {m.toolsUsed && m.toolsUsed.length > 0 && (
                      <span className="ml-1 text-[9px] text-neutral-700">
                        [{m.toolsUsed.slice(0, 3).join(",")}{m.toolsUsed.length > 3 ? "+" : ""}]
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] text-neutral-700 tabular-nums">
                    {timeSince(m.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Reply-input */}
          {activeChat && (
            <div className="mt-3 pt-2 border-t border-dashed border-neutral-900">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`skriv til ${activeChat}… (⌘+enter)`}
                rows={2}
                className="w-full bg-neutral-950 border border-neutral-900 px-2 py-1 text-[11px] font-mono text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-neutral-700 resize-none"
                disabled={sending}
              />
              <div className="flex items-center justify-between mt-1.5">
                <div className="text-[10px] text-neutral-700">
                  {sendError ? (
                    <span className="text-[#d87373]">⚠ {sendError}</span>
                  ) : (
                    <span>{draft.length}/4096</span>
                  )}
                </div>
                <button
                  onClick={() => void sendReply()}
                  disabled={!draft.trim() || sending}
                  className="px-2 py-0.5 text-[10px] uppercase tracking-wider border border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {sending ? "sender…" : "send"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
