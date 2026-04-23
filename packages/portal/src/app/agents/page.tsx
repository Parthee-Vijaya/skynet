"use client";
import { useEffect, useState, useCallback } from "react";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section, Dot, Sep } from "@/components/minimal/primitives";

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

const STATUS_COLOR: Record<string, string> = {
  running: "#7dd67d",
  idle: "#9bd0ff",
  stopped: "#6b6b6b",
  error: "#d87373",
  waiting: "#e6b450",
};

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
    <MinimalPageLayout active="agents">
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 60px" }}>
        {/* Header row */}
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="font-mono text-[11px] text-neutral-500 lowercase tracking-wide">
              <span className="mr-1">#</span>agents
              <span className="float-right ml-4 text-neutral-700">daemon :6767</span>
            </h1>
            <div className="font-mono text-[12px] mt-2">
              {loading ? (
                <span className="text-neutral-600">forbinder…</span>
              ) : data?.online ? (
                <span className="text-[#7dd67d]"><Dot tone="ok" />daemon online<Sep />{data.agents.length} agents</span>
              ) : (
                <span className="text-[#d87373]"><Dot tone="bad" />daemon offline</span>
              )}
            </div>
          </div>
          <div className="flex gap-3 font-mono text-[11px]">
            <a href="/delegate" className="text-neutral-500 hover:text-neutral-100">delegate →</a>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="text-neutral-100 hover:text-white"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {showCreate ? "× annuller" : "+ ny agent"}
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div
            className="mb-6 font-mono"
            style={{ borderTop: "1px dashed #262626", borderBottom: "1px dashed #262626", padding: "16px 0" }}
          >
            <div className="text-[11px] text-neutral-500 mb-2">prompt</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="beskriv opgaven for agenten…"
              style={{
                width: "100%",
                background: "#111",
                border: "1px dashed #262626",
                padding: "8px 10px",
                color: "#e5e5e5",
                fontFamily: "inherit",
                fontSize: 12,
                resize: "vertical",
                outline: "none",
              }}
            />
            <div className="flex justify-end gap-4 mt-3 text-[11px]">
              <button onClick={() => setShowCreate(false)} style={{ background: "none", border: "none", color: "#6b6b6b", cursor: "pointer" }}>
                annuller
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !prompt.trim()}
                style={{ background: "none", border: "none", color: creating || !prompt.trim() ? "#6b6b6b" : "#f5f5f5", cursor: "pointer" }}
              >
                {creating ? "opretter…" : "→ start agent"}
              </button>
            </div>
          </div>
        )}

        {/* Offline */}
        {!loading && !data?.online && (
          <div className="font-mono" style={{ paddingTop: 40 }}>
            <div className="text-[#d87373] mb-3"><Dot tone="bad" />daemon offline · port 6767</div>
            <div className="text-neutral-500 text-[12px] mb-2">start daemon med:</div>
            <code style={{ display: "block", color: "#9bd0ff", fontSize: 12 }}>
              cd /Users/parthee/Desktop/Claude/projekter/skynet && npm run dev:daemon
            </code>
          </div>
        )}

        {/* Agent tables */}
        {!loading && data?.online && (
          <>
            {data.agents.length === 0 && (
              <div className="font-mono text-neutral-600 text-[12px]" style={{ paddingTop: 40 }}>
                ingen aktive agents · klik &quot;+ ny agent&quot; for at starte en
              </div>
            )}

            {running.length > 0 && (
              <Section title={`kørende (${running.length})`} className="mb-8">
                <AgentTable agents={running} />
              </Section>
            )}

            {others.length > 0 && (
              <Section title={`afsluttede (${others.length})`}>
                <AgentTable agents={others} dim />
              </Section>
            )}
          </>
        )}
      </main>
    </MinimalPageLayout>
  );
}

function AgentTable({ agents, dim }: { agents: Agent[]; dim?: boolean }) {
  return (
    <table style={{ width: "100%", fontFamily: "inherit", fontSize: 12, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "#6b6b6b", borderBottom: "1px dashed #262626" }}>
          <th style={{ textAlign: "left", padding: "0 8px 6px 0", fontWeight: 400, width: "120px" }}>id</th>
          <th style={{ textAlign: "left", padding: "0 8px 6px 0", fontWeight: 400, width: "80px" }}>status</th>
          <th style={{ textAlign: "left", padding: "0 8px 6px 0", fontWeight: 400 }}>prompt</th>
          <th style={{ textAlign: "left", padding: "0 8px 6px 0", fontWeight: 400 }}>model</th>
          <th style={{ textAlign: "left", padding: "0 0 6px 0", fontWeight: 400 }}>mappe</th>
        </tr>
      </thead>
      <tbody>
        {agents.map((a) => (
          <tr
            key={a.id}
            style={{ borderBottom: "1px dashed #1c1c1c", color: dim ? "#6b6b6b" : "#e5e5e5" }}
          >
            <td style={{ padding: "8px 8px 8px 0", fontFamily: "inherit", color: "#9bd0ff" }}>
              {a.id.slice(0, 10)}
            </td>
            <td style={{ padding: "8px 8px 8px 0" }}>
              <span style={{ color: STATUS_COLOR[a.status] ?? "#6b6b6b" }}>
                ● {a.status}
              </span>
            </td>
            <td style={{ padding: "8px 8px 8px 0", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.prompt ?? "—"}
            </td>
            <td style={{ padding: "8px 8px 8px 0", color: "#6b6b6b" }}>
              {a.provider ? `${a.provider}` : ""}
              {a.model ? ` · ${a.model}` : "—"}
            </td>
            <td style={{ padding: "8px 0 8px 0", color: "#6b6b6b", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
              {a.directory ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
