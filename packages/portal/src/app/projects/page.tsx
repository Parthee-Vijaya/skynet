"use client";

import { useMemo } from "react";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section, Dot } from "@/components/minimal/primitives";
import { usePoll } from "@/hooks/usePoll";
import { statusTone, type ProjectEntry, type ProjectStatus } from "@/lib/projects";

/**
 * /projects — overblik over alle Claude Code-drevne projekter.
 *
 * Hvert kort henter live: aktive branch, dirty-state, commits-ahead, sidste
 * commit + recent log, samt et uddrag af projektets memory-fil (backlog +
 * seneste session-log-entries). Polles hver 60s; en commit på en projekt
 * reflekteres næste poll.
 */

interface ProjectsResponse {
  projects: ProjectStatusClient[];
  generatedAt: string;
}

// Klient-version af ProjectStatus (server-typen indeholder kun ikke-server felter)
interface ProjectStatusClient extends ProjectEntry {
  git?: {
    branch: string;
    isDirty: boolean;
    aheadOfMain: number;
    lastCommit: { hash: string; message: string; date: string; relativeDate: string };
    recentCommits: Array<{ hash: string; message: string; date: string; relativeDate: string }>;
  };
  memory?: {
    headline: string;
    backlog: string[];
    recentSessionLog: Array<{ date: string; text: string }>;
  };
  errors?: string[];
}

export default function ProjectsPage() {
  const { data } = usePoll<ProjectsResponse>("/api/projects", 60_000);
  const projects = data?.projects ?? [];

  const summary = useMemo(() => {
    const active = projects.filter((p) => p.status === "active").length;
    const dirty = projects.filter((p) => p.git?.isDirty).length;
    const ahead = projects.filter((p) => (p.git?.aheadOfMain ?? 0) > 0).length;
    return { active, dirty, ahead, total: projects.length };
  }, [projects]);

  return (
    <MinimalPageLayout active="projects">
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px 60px" }} className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-mono text-[15px] text-neutral-100 lowercase">projects</h1>
          <p className="font-mono text-[11px] text-neutral-500">
            claude code-drevne arbejder · live status fra git + memory-filer
          </p>
        </div>
        <header className="font-mono text-[11px] text-neutral-500 flex flex-wrap gap-x-6 gap-y-1 pb-2 border-b border-neutral-900">
          <span>
            <span className="text-neutral-300">{summary.active}</span> aktive
            <span className="text-neutral-700"> / {summary.total}</span>
          </span>
          {summary.dirty > 0 && (
            <span>
              <Dot tone="warn" />
              <span className="text-amber-500/80">{summary.dirty} dirty</span>
            </span>
          )}
          {summary.ahead > 0 && (
            <span>
              <Dot tone="ok" />
              <span className="text-emerald-500/80">{summary.ahead} med unmerged commits</span>
            </span>
          )}
          {data?.generatedAt && (
            <span className="ml-auto text-neutral-700">
              opdateret {new Date(data.generatedAt).toLocaleTimeString("da-DK")}
            </span>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      </main>
    </MinimalPageLayout>
  );
}

function ProjectCard({ project: p }: { project: ProjectStatusClient }) {
  const tone = statusTone(p.status);
  const statusLabel =
    p.status === "active" ? "aktiv" : p.status === "planned" ? "planlagt" : "arkiveret";

  return (
    <div className="border border-neutral-900 bg-[#0a0a0a] hover:border-neutral-800 transition-colors p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="text-[20px] leading-none mt-0.5">{p.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="font-mono text-[14px] text-neutral-100 lowercase">{p.name}</h2>
            <span className="font-mono text-[10px] text-neutral-700 uppercase tracking-wider">
              <Dot tone={tone} />
              {statusLabel}
            </span>
          </div>
          <p className="text-[12px] text-neutral-400 mt-1 leading-relaxed">
            {p.description}
          </p>
        </div>
      </div>

      {/* Git state */}
      {p.git ? (
        <div className="space-y-2 pt-1">
          <div className="font-mono text-[10.5px] flex items-center gap-2 flex-wrap text-neutral-500">
            <span className="text-neutral-300">
              <span className="opacity-60">⌥</span> {p.git.branch}
            </span>
            {p.git.isDirty && <span className="text-amber-500/80">● dirty</span>}
            {p.git.aheadOfMain > 0 && (
              <span className="text-emerald-500/80">↑{p.git.aheadOfMain} ahead</span>
            )}
            {p.git.aheadOfMain === 0 && !p.git.isDirty && (
              <span className="text-neutral-600">clean</span>
            )}
          </div>
          <RecentCommits commits={p.git.recentCommits.slice(0, 4)} />
        </div>
      ) : p.status === "planned" ? (
        <div className="font-mono text-[10.5px] text-neutral-600 italic pt-1">
          intet repo endnu
        </div>
      ) : null}

      {/* Memory: backlog + session-log */}
      {p.memory && (p.memory.backlog.length > 0 || p.memory.recentSessionLog.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-neutral-900">
          {p.memory.backlog.length > 0 && (
            <Section title="mangler">
              <ul className="font-mono text-[10.5px] text-neutral-400 space-y-1">
                {p.memory.backlog.slice(0, 5).map((item, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-neutral-700 shrink-0">·</span>
                    <span className="truncate">{stripMarkdown(item)}</span>
                  </li>
                ))}
                {p.memory.backlog.length > 5 && (
                  <li className="text-neutral-700 text-[10px] pt-0.5">
                    + {p.memory.backlog.length - 5} flere
                  </li>
                )}
              </ul>
            </Section>
          )}

          {p.memory.recentSessionLog.length > 0 && (
            <Section title="seneste sessioner">
              <ul className="font-mono text-[10.5px] text-neutral-400 space-y-1.5">
                {p.memory.recentSessionLog.slice(0, 3).map((entry, i) => (
                  <li key={i}>
                    <div className="text-neutral-600 text-[10px]">{entry.date}</div>
                    <div className="text-neutral-400 line-clamp-2 leading-snug">
                      {stripMarkdown(entry.text)}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {/* Tags + links */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-900">
        <div className="flex flex-wrap gap-1.5">
          {(p.tags ?? []).slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="font-mono text-[9.5px] text-neutral-600 border border-neutral-900 px-1.5 py-0.5 lowercase"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] text-neutral-600">
          {p.githubRepo && (
            <a
              href={`https://github.com/${p.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-300"
              title="GitHub"
            >
              github ↗
            </a>
          )}
          {p.appId && (
            <a
              href={`/apps#${p.appId}`}
              className="hover:text-neutral-300"
              title="Åbn i apps-hub"
            >
              app ↗
            </a>
          )}
        </div>
      </div>

      {/* Errors */}
      {p.errors && p.errors.length > 0 && (
        <div className="font-mono text-[10px] text-red-500/80 pt-1">
          {p.errors.map((e, i) => (
            <div key={i}>⚠ {e}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentCommits({
  commits,
}: {
  commits: Array<{ hash: string; message: string; relativeDate: string }>;
}) {
  if (commits.length === 0) return null;
  return (
    <ul className="font-mono text-[10.5px] space-y-0.5">
      {commits.map((c) => (
        <li key={c.hash} className="flex gap-2 items-baseline">
          <span className="text-neutral-700 shrink-0 tabular-nums">{c.hash}</span>
          <span className="text-neutral-400 flex-1 truncate" title={c.message}>
            {stripCoauthor(c.message)}
          </span>
          <span className="text-neutral-700 shrink-0 text-[9.5px]">{c.relativeDate}</span>
        </li>
      ))}
    </ul>
  );
}

// Util: fjern markdown-formatting fra inline-tekst, så den kan renderes som plain
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

// Util: drop "Co-Authored-By:"-haler fra commit-headlines (kommer ikke i headline, men sikkerhed)
function stripCoauthor(msg: string): string {
  return msg.replace(/\s*Co-Authored-By:.+$/i, "").trim();
}
