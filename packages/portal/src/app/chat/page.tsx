"use client";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStream } from "@/components/chat/useChatStream";
import { MessageMetrics } from "@/components/chat/MessageMetrics";
import { ToolInvocationView } from "@/components/chat/ToolInvocationView";
import {
  getConversation,
  saveConversation,
  listConversations,
  deleteConversation,
  newConversationId,
  getVerbose,
  setVerbose as persistVerbose,
  type Conversation,
  type ConversationIndexEntry,
} from "@/lib/chat-storage";

interface ModelEntry {
  id: string;
  label?: string;
  tag?: string;
}

interface ModelsResp {
  available: boolean;
  baseUrl: string;
  models: ModelEntry[];
  missing: Array<{ hint: string; label: string; tag: string }>;
  error?: string;
}

const DEFAULT_SYSTEM_PROMPT =
  "Du er Skynet, en hjælpsom dansk assistent. Svar altid på dansk medmindre andet forespørges.";

function shortModel(id: string): string {
  const slash = id.lastIndexOf("/");
  const base = slash >= 0 ? id.slice(slash + 1) : id;
  return base;
}

function ChatInner() {
  const params = useSearchParams();
  const router = useRouter();
  const initialConvId = params.get("c");

  const [convId, setConvId] = useState<string>(initialConvId ?? newConversationId());
  const [convs, setConvs] = useState<ConversationIndexEntry[]>([]);
  const [modelsResp, setModelsResp] = useState<ModelsResp | null>(null);
  const [model, setModel] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPT);
  const [showPrompt, setShowPrompt] = useState(false);
  const [input, setInput] = useState("");
  const [verbose, setVerboseState] = useState(true);
  const [allowDestructive, setAllowDestructive] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, setMessages, send, stop, status, error } = useChatStream([]);

  useEffect(() => {
    setVerboseState(getVerbose());
    setConvs(listConversations());
    // Mobile-detektion: <768px → skjul sidebar som default
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      setIsMobile(mq.matches);
      if (mq.matches) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const existing = getConversation(convId);
    if (existing) {
      setMessages(existing.messages);
      setSystemPrompt(existing.systemPrompt || DEFAULT_SYSTEM_PROMPT);
      if (existing.model) setModel(existing.model);
    } else {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  useEffect(() => {
    let cancelled = false;
    const fetchModels = async () => {
      try {
        const res = await fetch("/api/chat/models", { cache: "no-store" });
        const data = (await res.json()) as ModelsResp;
        if (cancelled) return;
        setModelsResp(data);
        setModel((current) => {
          if (current && data.models.some((m) => m.id === current)) return current;
          return data.models[0]?.id ?? "";
        });
      } catch {
        if (!cancelled) setModelsResp({ available: false, baseUrl: "", models: [], missing: [] });
      }
    };
    fetchModels();
    const iv = setInterval(fetchModels, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    if (messages.length === 0) return;
    const conv: Conversation = {
      id: convId,
      title: messages.find((m) => m.role === "user")?.content.slice(0, 50) || "Ny samtale",
      model,
      systemPrompt,
      messages,
      createdAt: messages[0]?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    saveConversation(conv);
    setConvs(listConversations());
  }, [messages, convId, model, systemPrompt]);

  const onSend = async () => {
    const txt = input.trim();
    if (!txt || !model || status === "streaming") return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await send(txt, {
      model,
      systemPrompt,
      confirmDestructive: allowDestructive,
    });
    // Reset destructive-confirm efter brug — skal eksplicit aktiveres hver gang
    if (allowDestructive) setAllowDestructive(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const onTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  };

  const startNew = () => {
    const id = newConversationId();
    router.push(`/chat?c=${id}`);
    setConvId(id);
    setMessages([]);
    if (isMobile) setSidebarOpen(false);
  };

  const openConversation = (id: string) => {
    router.push(`/chat?c=${id}`);
    setConvId(id);
    if (isMobile) setSidebarOpen(false);
  };

  const removeConversation = (id: string) => {
    deleteConversation(id);
    setConvs(listConversations());
    if (id === convId) startNew();
  };

  const handleVerbose = (v: boolean) => {
    setVerboseState(v);
    persistVerbose(v);
  };

  const backendHint = useMemo(() => {
    if (!modelsResp) return "indlæser…";
    if (!modelsResp.available)
      return `LM Studio ikke tilgængelig · ${modelsResp.error ?? "start serveren"}`;
    if (modelsResp.models.length === 0) return "LM Studio kører — load en model";
    return `${modelsResp.models.length} model${modelsResp.models.length === 1 ? "" : "ler"} loaded`;
  }, [modelsResp]);

  const currentModelLabel = useMemo(() => {
    const m = modelsResp?.models.find((x) => x.id === model);
    return m?.label ?? (model ? shortModel(model) : "vælg model");
  }, [modelsResp, model]);

  const suggestions = [
    "Forklar MLX vs GGUF på dansk i en tabel",
    "Skriv et kort digt om København i efteråret",
    "Lav en to-do liste til en ny Next.js app",
    "Hvordan virker TTFT og tokens/sek?",
  ];

  return (
    <div className="h-[100dvh] flex bg-[#07090b] overflow-hidden relative">
      {/* Mobile backdrop når sidebar er åben */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — overlay på mobil, inline på desktop */}
      <aside
        className={`${
          isMobile
            ? `fixed top-0 left-0 h-[100dvh] w-[82vw] max-w-[320px] z-40 transform transition-transform duration-200 ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              }`
            : `${sidebarOpen ? "w-72" : "w-0"} shrink-0 transition-[width] duration-200`
        } border-r border-cyan-400/10 bg-[#0a0e11] overflow-hidden flex flex-col`}
      >
        <div className="p-3 border-b border-cyan-400/10 flex items-center gap-2">
          <Link
            href="/"
            title="Tilbage til dashboard"
            className="shrink-0 w-8 h-8 rounded-lg border border-cyan-400/20 flex items-center justify-center text-cyan-300 hover:border-cyan-400/50 hover:bg-cyan-400/5 transition-colors"
          >
            <span className="text-sm">←</span>
          </Link>
          <button
            onClick={startNew}
            className="flex-1 px-3 py-2 rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-cyan-100 text-sm font-medium hover:bg-cyan-500/25 hover:border-cyan-400/50 transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-base leading-none">+</span>
            Ny samtale
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {convs.length === 0 ? (
            <div className="text-xs text-neutral-600 px-4 py-6 text-center">
              Ingen samtaler endnu
            </div>
          ) : (
            <div className="px-2 space-y-0.5">
              {convs.map((c) => (
                <div
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`group px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    c.id === convId
                      ? "bg-cyan-400/10 border border-cyan-400/25"
                      : "hover:bg-neutral-900/70 border border-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13px] text-neutral-200 truncate flex-1 leading-snug">
                      {c.title || "Ny samtale"}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeConversation(c.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-rose-400 text-xs shrink-0"
                      title="Slet"
                    >
                      ✕
                    </button>
                  </div>
                  {c.preview && (
                    <div className="text-[11px] text-neutral-500 truncate mt-0.5">
                      {c.preview}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-cyan-400/10 space-y-2">
          <Link
            href="/settings"
            className="block px-3 py-2 rounded-lg text-xs text-neutral-400 hover:text-cyan-200 hover:bg-neutral-900/60 transition-colors"
          >
            ⚙ Indstillinger
          </Link>
          <div className="text-[10px] font-mono text-neutral-600 px-3 truncate">
            {backendHint}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="border-b border-cyan-400/10 bg-[#0a0e11]/90 backdrop-blur-sm">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title="Vis/skjul samtaler"
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg border border-cyan-400/15 text-neutral-300 hover:text-cyan-200 hover:border-cyan-400/50 flex items-center justify-center shrink-0"
            >
              ☰
            </button>

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="hidden sm:inline text-[10px] uppercase tracking-[0.25em] text-neutral-500 font-mono">
                Model
              </span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={status === "streaming" || !modelsResp?.available}
                className="bg-black/40 border border-cyan-400/20 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-mono text-cyan-100 focus:outline-none focus:border-cyan-400/50 disabled:opacity-40 flex-1 sm:flex-initial sm:max-w-[340px] min-w-0 truncate"
                title={currentModelLabel}
              >
                {modelsResp?.models.length === 0 && <option value="">(ingen modeller)</option>}
                {modelsResp?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label ? `${m.label} · ${shortModel(m.id)}` : shortModel(m.id)}
                  </option>
                ))}
              </select>
              {modelsResp?.available && (
                <span
                  className="w-2 h-2 rounded-full bg-emerald-400"
                  title="LM Studio tilgængelig"
                />
              )}
              {modelsResp && !modelsResp.available && (
                <span
                  className="w-2 h-2 rounded-full bg-rose-400 pulse-dot"
                  title="LM Studio ikke tilgængelig"
                />
              )}
            </div>

            <button
              onClick={() => setShowPrompt((v) => !v)}
              title="System-prompt"
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                showPrompt
                  ? "border-cyan-400/50 text-cyan-200 bg-cyan-400/10"
                  : "border-cyan-400/15 text-neutral-400 hover:text-cyan-200"
              }`}
            >
              system
            </button>

            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer select-none px-3 py-1.5 rounded-lg border border-cyan-400/15 hover:border-cyan-400/40">
              <input
                type="checkbox"
                checked={verbose}
                onChange={(e) => handleVerbose(e.target.checked)}
                className="accent-cyan-400"
              />
              verbose
            </label>

            <label
              className={`hidden sm:flex items-center gap-1.5 text-[11px] cursor-pointer select-none px-3 py-1.5 rounded-lg border transition-colors ${
                allowDestructive
                  ? "border-amber-400/50 text-amber-200 bg-amber-500/10"
                  : "border-cyan-400/15 text-neutral-400 hover:border-amber-400/40"
              }`}
              title="Tillad destruktive tool-actions (stop/restart/quit) i næste besked"
            >
              <input
                type="checkbox"
                checked={allowDestructive}
                onChange={(e) => setAllowDestructive(e.target.checked)}
                className="accent-amber-400"
              />
              tillad stop/quit
            </label>
          </div>

          {showPrompt && (
            <div className="px-4 pb-3">
              <div className="max-w-3xl mx-auto">
                <label className="text-[10px] uppercase tracking-[0.25em] text-neutral-500 font-mono">
                  System-prompt
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  className="mt-1.5 w-full bg-black/40 border border-cyan-400/20 rounded-lg p-3 text-sm text-neutral-200 font-mono focus:outline-none focus:border-cyan-400/50"
                />
              </div>
            </div>
          )}
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4 py-12">
              <div className="text-center max-w-xl">
                <div className="text-5xl font-thin text-cyan-300/80 mb-3 tracking-tight">
                  S.K.Y.N.E.T.
                </div>
                <div className="text-sm text-neutral-400 mb-8">
                  Lokal chat drevet af LM Studio på din Mac.
                  {currentModelLabel !== "vælg model" && (
                    <>
                      <br />
                      <span className="text-[11px] font-mono text-cyan-300/60 mt-1 inline-block">
                        {shortModel(model)}
                      </span>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      disabled={!modelsResp?.available}
                      className="text-left px-4 py-3 rounded-xl border border-cyan-400/15 bg-[#0d1518]/60 text-[13px] text-neutral-300 hover:border-cyan-400/40 hover:bg-[#101a1e] transition-colors disabled:opacity-30"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="chat-user-bubble max-w-[85%]">{m.content}</div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="flex gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-full border border-cyan-400/40 bg-cyan-500/10 flex items-center justify-center text-[11px] font-mono uppercase text-cyan-300 mt-0.5">
                      J
                    </div>
                    <div className="flex-1 min-w-0">
                      {m.tools && m.tools.length > 0 && (
                        <ToolInvocationView tools={m.tools} />
                      )}
                      {m.content ? (
                        <div className="chat-md">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      ) : m.tools && m.tools.length > 0 ? null : (
                        <div className="text-cyan-400/60 text-sm">
                          <span className="inline-block w-1.5 h-4 bg-cyan-400/60 animate-pulse align-middle" />
                        </div>
                      )}
                      {verbose && <MessageMetrics m={m.metrics} />}
                    </div>
                  </div>
                );
              })}

              {status === "streaming" && (
                <div className="flex gap-3 items-center pl-11 text-[11px] font-mono text-cyan-400/70">
                  <span className="inline-block w-1.5 h-3 bg-cyan-400/70 animate-pulse" />
                  genererer svar…
                  {status === "streaming" && (
                    <button
                      onClick={stop}
                      className="ml-2 px-2 py-0.5 rounded-md border border-rose-400/30 text-rose-300 text-[10px] hover:bg-rose-500/10"
                    >
                      stop
                    </button>
                  )}
                </div>
              )}

              {error && (
                <div className="text-sm text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl p-3">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-cyan-400/10 bg-[#0a0e11]/95 backdrop-blur-sm px-4 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative rounded-2xl border border-cyan-400/20 bg-[#0d1518]/90 focus-within:border-cyan-400/50 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={onTextareaInput}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={
                  modelsResp?.available
                    ? "Send en besked…"
                    : "LM Studio skal køre først"
                }
                disabled={!modelsResp?.available || !model}
                className="w-full resize-none bg-transparent px-4 py-3 pr-14 text-[15px] text-neutral-100 placeholder-neutral-600 focus:outline-none disabled:opacity-40"
                style={{ maxHeight: 220 }}
              />
              {status === "streaming" ? (
                <button
                  onClick={stop}
                  className="absolute right-2 bottom-2 w-10 h-10 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white flex items-center justify-center"
                  title="Stop generering"
                >
                  <span className="block w-3 h-3 bg-white rounded-sm" />
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={!input.trim() || !model || !modelsResp?.available}
                  className="absolute right-2 bottom-2 w-10 h-10 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title="Send (Enter)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <div className="text-[10px] font-mono text-neutral-600">
                Enter sender · Shift+Enter ny linje
              </div>
              {modelsResp?.missing && modelsResp.missing.length > 0 && modelsResp.available && (
                <div className="text-[10px] text-amber-400/70">
                  mangler: {modelsResp.missing.map((m) => m.label).join(", ")}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8 text-neutral-500">Indlæser…</div>}>
      <ChatInner />
    </Suspense>
  );
}
