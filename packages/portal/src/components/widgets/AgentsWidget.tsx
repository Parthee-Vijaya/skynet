"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "../ui/Card";

interface AgentSummary {
  online: boolean;
  agents: { id: string; status: string; prompt?: string }[];
}

export function AgentsWidget() {
  const [data, setData] = useState<AgentSummary | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/daemon/agents");
        setData(await res.json());
      } catch {
        setData({ online: false, agents: [] });
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const running = data?.agents.filter((a) => a.status === "running").length ?? 0;
  const total = data?.agents.length ?? 0;

  return (
    <Card className="lg:col-span-3 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Agents</h3>
        <span
          className={`w-1.5 h-1.5 rounded-full ${data?.online ? "bg-green-500" : "bg-red-500"}`}
        />
      </div>

      {!data?.online ? (
        <p className="text-xs text-neutral-600">Daemon offline</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-thin text-cyan-100 tabular-nums">{running}</span>
            <span className="text-xs text-neutral-500">kørende</span>
            {total > running && (
              <span className="text-xs text-neutral-600 ml-1">/ {total} total</span>
            )}
          </div>

          {data.agents
            .filter((a) => a.status === "running")
            .slice(0, 3)
            .map((a) => (
              <div key={a.id} className="text-[11px] text-neutral-400 truncate">
                <span className="text-green-400 mr-1">●</span>
                {a.prompt?.slice(0, 60) ?? a.id.slice(0, 12)}
              </div>
            ))}
        </div>
      )}

      <Link
        href="/agents"
        className="block mt-3 pt-2 border-t border-cyan-400/5 text-[10px] text-cyan-400/40 hover:text-cyan-400/70 transition-colors"
      >
        Se alle agents →
      </Link>
    </Card>
  );
}
