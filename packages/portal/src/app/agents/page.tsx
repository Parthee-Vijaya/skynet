"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Agent {
  id: string;
  status: string;
  provider?: string;
  model?: string;
  directory?: string;
  prompt?: string;
  createdAt?: string;
}

interface AgentsResponse {
  online: boolean;
  agents: Agent[];
  error?: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-green-500/20 text-green-400 border-green-500/30",
    idle: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    stopped: "bg-neutral-500/20 text-neutral-400 border-neutral-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
    waiting: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  const c = colors[status] ?? colors.idle;
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${c}`}>
      {status}
    </span>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="rounded-xl border border-cyan-400/10 bg-[#0d1518]/60 p-4 hover:border-cyan-400/25 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-xs text-cyan-300 font-mono truncate">{agent.id.slice(0, 12)}</code>
            <StatusBadge status={agent.status} />
          </div>
          {agent.prompt && (
            <p className="text-sm text-neutral-300 line-clamp-2 mt-1">{agent.prompt}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-500">
            {agent.provider && <span>{agent.provider}</span>}
            {agent.model && <span>· {agent.model}</span>}
            {agent.directory && <span className="truncate max-w-[200px]">· {agent.directory}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/daemon/agents");
      const json = await res.json();
      setData(json);
    } catch {
      setData({ online: false, agents: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const id = setInterval(fetchAgents, 5000);
    return () => clearInterval(id);
  }, [fetchAgents]);

  const handleCreate = async () => {
    if (!prompt.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/daemon/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      setPrompt("");
      setShowCreate(false);
      fetchAgents();
    } finally {
      setCreating(false);
    }
  };

  const running = data?.agents.filter((a) => a.status === "running") ?? [];
  const others = data?.agents.filter((a) => a.status !== "running") ?? [];

  return (
    <div className="min-h-screen p-3 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/" className="text-cyan-400/60 hover:text-cyan-400 text-sm">
                ← Dashboard
              </Link>
            </div>
            <h1 className="text-2xl font-light text-cyan-100 mt-2">Agents</h1>
            <p className="text-xs text-neutral-500 mt-1">
              {data?.online ? (
                <span className="text-green-400">● Daemon online</span>
              ) : (
                <span className="text-red-400">● Daemon offline</span>
              )}
              {data && ` · ${data.agents.length} agent${data.agents.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/delegate"
              className="text-xs px-3 py-1.5 rounded-lg border border-cyan-400/20 text-cyan-400/70 hover:text-cyan-400 hover:border-cyan-400/40 transition-colors"
            >
              Quick Delegate
            </Link>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/30 transition-colors"
            >
              + Ny Agent
            </button>
          </div>
        </header>

        {/* Create agent form */}
        {showCreate && (
          <div className="mb-6 rounded-xl border border-cyan-400/20 bg-[#0d1518]/80 p-4">
            <label className="text-xs text-neutral-400 block mb-2">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Beskriv opgaven for agenten..."
              className="w-full bg-black/30 border border-cyan-400/10 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-cyan-400/30 resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowCreate(false)}
                className="text-xs px-3 py-1.5 text-neutral-500 hover:text-neutral-300"
              >
                Annuller
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !prompt.trim()}
                className="text-xs px-4 py-1.5 rounded-lg bg-cyan-500/30 text-cyan-200 hover:bg-cyan-500/40 disabled:opacity-50 transition-colors"
              >
                {creating ? "Opretter…" : "Start Agent"}
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-20 text-neutral-500 text-sm">
            Forbinder til daemon…
          </div>
        )}

        {/* Offline state */}
        {!loading && !data?.online && (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🔌</div>
            <h2 className="text-lg text-neutral-300 mb-2">Daemon offline</h2>
            <p className="text-sm text-neutral-500 max-w-md mx-auto">
              Skynet daemon kører ikke på port 6767. Start den med:
            </p>
            <code className="text-xs text-cyan-400/70 mt-3 block">npm run dev:daemon</code>
          </div>
        )}

        {/* Agent list */}
        {!loading && data?.online && (
          <div className="space-y-6">
            {data.agents.length === 0 && (
              <div className="text-center py-16 text-neutral-500 text-sm">
                Ingen aktive agents. Klik &quot;+ Ny Agent&quot; for at starte en.
              </div>
            )}

            {running.length > 0 && (
              <section>
                <h2 className="text-xs uppercase tracking-wider text-cyan-400/50 mb-3">
                  Kørende ({running.length})
                </h2>
                <div className="grid gap-2">
                  {running.map((a) => (
                    <AgentCard key={a.id} agent={a} />
                  ))}
                </div>
              </section>
            )}

            {others.length > 0 && (
              <section>
                <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
                  Afsluttede ({others.length})
                </h2>
                <div className="grid gap-2">
                  {others.map((a) => (
                    <AgentCard key={a.id} agent={a} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
