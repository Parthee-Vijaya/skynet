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

interface ModelEntry { id: string; label?: string; tag?: string; }
interface ModelsResp {
  available: boolean;
  baseUrl: string;
  models: ModelEntry[];
  missing: Array<{ hint: string; label: string; tag: string }>;
  error?: string;
}

const DEFAULT_SYSTEM_PROMPT = "Du er Skynet, en hjælpsom dansk assistent. Svar altid på dansk medmindre andet forespørges.";

function shortModel(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" };

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
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => { setIsMobile(mq.matches); if (mq.matches) setSidebarOpen(false); else setSidebarOpen(true); };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const existing = getConversation(convId);
    if (existing) { setMessages(existing.messages); setSystemPrompt(existing.systemPrompt || DEFAULT_SYSTEM_PROMPT); if (existing.model) setModel(existing.model); }
    else setMessages([]);
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
        setModel((current) => { if (current && data.models.some((m) => m.id === current)) return current; return data.models[0]?.id ?? ""; });
      } catch { if (!cancelled) setModelsResp({ available: false, baseUrl: "", models: [], missing: [] }); }
    };
    fetchModels();
    const iv = setInterval(fetchModels, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, status]);

  useEffect(() => {
    if (messages.length === 0) return;
    const conv: Conversation = { id: convId, title: messages.find((m) => m.role === "user")?.content.slice(0, 50) || "Ny samtale", model, systemPrompt, messages, createdAt: messages[0]?.createdAt ?? Date.now(), updatedAt: Date.now() };
    saveConversation(conv);
    setConvs(listConversations());
  }, [messages, convId, model, systemPrompt]);

  const onSend = async () => {
    const txt = input.trim();
    if (!txt || !model || status === "streaming") return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await send(txt, { model, systemPrompt, confirmDestructive: allowDestructive });
    if (allowDestructive) setAllowDestructive(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } };
  const onTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => { setInput(e.target.value); const ta = e.target; ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`; };

  const startNew = () => { const id = newConversationId(); router.push(`/chat?c=${id}`); setConvId(id); setMessages([]); if (isMobile) setSidebarOpen(false); };
  const openConversation = (id: string) => { router.push(`/chat?c=${id}`); setConvId(id); if (isMobile) setSidebarOpen(false); };
  const removeConversation = (id: string) => { deleteConversation(id); setConvs(listConversations()); if (id === convId) startNew(); };
  const handleVerbose = (v: boolean) => { setVerboseState(v); persistVerbose(v); };

  const backendHint = useMemo(() => {
    if (!modelsResp) return "indlæser…";
    if (!modelsResp.available) return `LM Studio ikke tilgængelig · ${modelsResp.error ?? "start serveren"}`;
    if (modelsResp.models.length === 0) return "LM Studio kører — load en model";
    return `${modelsResp.models.length} model${modelsResp.models.length === 1 ? "" : "ler"} loaded`;
  }, [modelsResp]);

  const currentModelLabel = useMemo(() => {
    const m = modelsResp?.models.find((x) => x.id === model);
    return m?.label ?? (model ? shortModel(model) : "vælg model");
  }, [modelsResp, model]);

  const suggestions = ["Forklar MLX vs GGUF på dansk i en tabel", "Skriv et kort digt om København i efteråret", "Lav en to-do liste til en ny Next.js app", "Hvordan virker TTFT og tokens/sek?"];

  const BORDER = "1px solid #1c1c1c";

  return (
    <div style={{ height: "100dvh", display: "flex", background: "#0a0a0a", overflow: "hidden", position: "relative", ...MONO, fontSize: 13, color: "#e5e5e5", WebkitFontSmoothing: "antialiased" }}>
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 30 }} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside style={{
        ...(isMobile
          ? { position: "fixed", top: 0, left: 0, height: "100dvh", width: "80vw", maxWidth: 280, zIndex: 40, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform 200ms" }
          : { width: sidebarOpen ? 240 : 0, transition: "width 200ms", flexShrink: 0 }),
        borderRight: BORDER,
        background: "#0a0a0a",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Sidebar top */}
        <div style={{ padding: "10px 12px", borderBottom: BORDER, display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/" style={{ color: "#6b6b6b", fontSize: 11, textDecoration: "none" }}>← cockpit</Link>
          <button onClick={startNew} style={{ flex: 1, background: "none", border: "1px dashed #333", color: "#9bd0ff", padding: "4px 10px", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>
            + ny samtale
          </button>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {convs.length === 0 ? (
            <div style={{ color: "#6b6b6b", fontSize: 11, padding: "20px 16px", textAlign: "center" }}>ingen samtaler endnu</div>
          ) : convs.map((c) => (
            <div
              key={c.id}
              onClick={() => openConversation(c.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", cursor: "pointer", borderBottom: "1px solid #111", background: c.id === convId ? "#141414" : "transparent" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: c.id === convId ? "#e5e5e5" : "#9b9b9b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title || "ny samtale"}</div>
                {c.preview && <div style={{ color: "#6b6b6b", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.preview}</div>}
              </div>
              <button onClick={(e) => { e.stopPropagation(); removeConversation(c.id); }} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>

        {/* Sidebar footer */}
        <div style={{ padding: "8px 12px", borderTop: BORDER }}>
          <Link href="/settings" style={{ color: "#6b6b6b", fontSize: 11, textDecoration: "none", display: "block", marginBottom: 4 }}>⚙ indstillinger</Link>
          <div style={{ color: "#444", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{backendHint}</div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <header style={{ borderBottom: BORDER, background: "#0a0a0a" }}>
          <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setSidebarOpen((v) => !v)} style={{ background: "none", border: "1px dashed #333", color: "#9b9b9b", padding: "3px 8px", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>☰</button>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={status === "streaming" || !modelsResp?.available}
              style={{ background: "#111", border: "1px dashed #333", padding: "3px 8px", color: "#9bd0ff", fontFamily: "inherit", fontSize: 11, outline: "none", flex: "1 1 auto", maxWidth: 320, overflow: "hidden" }}
            >
              {modelsResp?.models.length === 0 && <option value="">(ingen modeller)</option>}
              {modelsResp?.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label ? `${m.label} · ${shortModel(m.id)}` : shortModel(m.id)}</option>
              ))}
            </select>

            {modelsResp?.available && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7dd67d", display: "inline-block" }} title="LM Studio tilgængelig" />}
            {modelsResp && !modelsResp.available && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#d87373", display: "inline-block" }} title="LM Studio ikke tilgængelig" />}

            <button
              onClick={() => setShowPrompt((v) => !v)}
              style={{ background: "none", border: `1px dashed ${showPrompt ? "#555" : "#333"}`, color: showPrompt ? "#e5e5e5" : "#6b6b6b", padding: "3px 8px", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}
            >
              system
            </button>

            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6b6b6b", cursor: "pointer", border: "1px dashed #333", padding: "3px 8px" }}>
              <input type="checkbox" checked={verbose} onChange={(e) => handleVerbose(e.target.checked)} />
              verbose
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, cursor: "pointer", border: `1px dashed ${allowDestructive ? "#665533" : "#333"}`, padding: "3px 8px", color: allowDestructive ? "#e6b450" : "#6b6b6b" }}>
              <input type="checkbox" checked={allowDestructive} onChange={(e) => setAllowDestructive(e.target.checked)} />
              tillad stop/quit
            </label>
          </div>

          {showPrompt && (
            <div style={{ padding: "0 12px 10px" }}>
              <div style={{ color: "#6b6b6b", fontSize: 10, marginBottom: 4 }}>system-prompt</div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3}
                style={{ width: "100%", background: "#111", border: "1px dashed #333", padding: "6px 10px", color: "#e5e5e5", fontFamily: "inherit", fontSize: 12, outline: "none", resize: "vertical", boxSizing: "border-box" }}
              />
            </div>
          )}
        </header>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0" }}>
          {messages.length === 0 ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
              <div style={{ textAlign: "center", maxWidth: 480 }}>
                <div style={{ fontSize: 28, color: "#e5e5e5", marginBottom: 8, letterSpacing: "0.1em" }}>S.K.Y.N.E.T.</div>
                <div style={{ fontSize: 12, color: "#6b6b6b", marginBottom: 24 }}>
                  lokal chat drevet af LM Studio på din Mac
                  {currentModelLabel !== "vælg model" && <><br /><span style={{ color: "#9bd0ff" }}>{shortModel(model)}</span></>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => setInput(s)} disabled={!modelsResp?.available} style={{ textAlign: "left", background: "#0d0d0d", border: "1px dashed #262626", padding: "10px 12px", color: "#9b9b9b", fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
              {messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div style={{ background: "#141414", border: "1px solid #1c1c1c", padding: "8px 12px", maxWidth: "85%", fontSize: 13, color: "#e5e5e5", lineHeight: 1.5 }}>{m.content}</div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} style={{ display: "flex", gap: 10 }}>
                    <div style={{ flexShrink: 0, width: 20, height: 20, border: "1px dashed #333", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#6b6b6b", marginTop: 2 }}>S</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {m.tools && m.tools.length > 0 && <ToolInvocationView tools={m.tools} />}
                      {m.content ? (
                        <div className="chat-md" style={{ fontSize: 13, lineHeight: 1.6, color: "#e5e5e5" }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                      ) : m.tools && m.tools.length > 0 ? null : (
                        <div style={{ color: "#6b6b6b", fontSize: 13 }}>
                          <span style={{ display: "inline-block", width: 6, height: 14, background: "#6b6b6b", animation: "pulse 1s ease-in-out infinite", verticalAlign: "middle" }} />
                        </div>
                      )}
                      {verbose && <MessageMetrics m={m.metrics} />}
                    </div>
                  </div>
                );
              })}

              {status === "streaming" && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", paddingLeft: 30, fontSize: 11, color: "#6b6b6b" }}>
                  <span style={{ display: "inline-block", width: 6, height: 12, background: "#6b6b6b" }} />
                  genererer svar…
                  <button onClick={stop} style={{ background: "none", border: "1px dashed #4a2a2a", color: "#d87373", padding: "2px 8px", fontFamily: "inherit", fontSize: 10, cursor: "pointer", marginLeft: 8 }}>stop</button>
                </div>
              )}

              {error && (
                <div style={{ fontSize: 12, color: "#d87373", border: "1px dashed #4a2a2a", padding: "8px 12px" }}>{error}</div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{ borderTop: BORDER, background: "#0a0a0a", padding: "12px 16px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", border: "1px dashed #333", background: "#0d0d0d", padding: "6px 8px" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={onTextareaInput}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={modelsResp?.available ? "send en besked…" : "LM Studio skal køre først"}
                disabled={!modelsResp?.available || !model}
                style={{ flex: 1, resize: "none", background: "transparent", border: "none", color: "#e5e5e5", fontFamily: "inherit", fontSize: 13, outline: "none", maxHeight: 220, lineHeight: 1.5, padding: "2px 4px" }}
              />
              {status === "streaming" ? (
                <button onClick={stop} style={{ background: "#4a2a2a", border: "none", color: "#d87373", padding: "4px 10px", fontFamily: "inherit", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>■ stop</button>
              ) : (
                <button onClick={onSend} disabled={!input.trim() || !model || !modelsResp?.available} style={{ background: "none", border: "1px dashed #444", color: (!input.trim() || !model || !modelsResp?.available) ? "#444" : "#f5f5f5", padding: "4px 12px", fontFamily: "inherit", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>→</button>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#444" }}>
              <span>Enter sender · Shift+Enter ny linje</span>
              {modelsResp?.missing && modelsResp.missing.length > 0 && modelsResp.available && (
                <span style={{ color: "#e6b450" }}>mangler: {modelsResp.missing.map((m) => m.label).join(", ")}</span>
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
    <Suspense fallback={<div style={{ padding: 40, color: "#6b6b6b", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>indlæser…</div>}>
      <ChatInner />
    </Suspense>
  );
}
