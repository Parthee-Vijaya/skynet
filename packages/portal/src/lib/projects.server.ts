import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  DEFAULT_PROJECTS,
  type ProjectEntry,
} from "./projects";

/**
 * Server-only: læser git-state + memory-fil for hvert projekt og returnerer
 * en beriget liste til UI'en. Bundler ikke i klient pga. node:fs / node:child_process.
 *
 * Strategi: ingen cache i denne version — git-kald er hurtige (~10-30ms hver,
 * og vi pipelin'er ikke), og siden hentes manuelt eller via 60s usePoll. Hvis
 * det viser sig hot kan vi cache i 30s med revalidateTag i Next.js.
 */

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export interface GitInfo {
  branch: string;
  isDirty: boolean;
  aheadOfMain: number;
  lastCommit: { hash: string; message: string; date: string; relativeDate: string };
  recentCommits: Array<{ hash: string; message: string; date: string; relativeDate: string }>;
}

export interface MemoryInfo {
  headline: string;
  backlog: string[];
  recentSessionLog: Array<{ date: string; text: string }>;
}

export interface ProjectStatus extends ProjectEntry {
  git?: GitInfo;
  memory?: MemoryInfo;
  errors?: string[];
}

export function getProjectsWithStatus(): ProjectStatus[] {
  return DEFAULT_PROJECTS.map((p) => buildStatus(p));
}

export function getProjectById(id: string): ProjectStatus | undefined {
  const entry = DEFAULT_PROJECTS.find((p) => p.id === id);
  if (!entry) return undefined;
  return buildStatus(entry);
}

// --------------------------------------------------------------------------
// Internals
// --------------------------------------------------------------------------

function buildStatus(p: ProjectEntry): ProjectStatus {
  const errors: string[] = [];
  let git: GitInfo | undefined;
  let memory: MemoryInfo | undefined;

  if (p.repoPath && existsSync(`${p.repoPath}/.git`)) {
    try {
      git = readGitInfo(p.repoPath);
    } catch (e) {
      errors.push(`git: ${(e as Error).message}`);
    }
  } else if (p.repoPath) {
    errors.push("repoPath findes ikke eller er ikke et git-repo");
  }

  if (p.memoryPath && existsSync(p.memoryPath)) {
    try {
      memory = readMemoryInfo(p.memoryPath);
    } catch (e) {
      errors.push(`memory: ${(e as Error).message}`);
    }
  }

  return { ...p, git, memory, errors: errors.length ? errors : undefined };
}

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    timeout: 5000,
  }).trim();
}

function readGitInfo(repoPath: string): GitInfo {
  const branch = git(repoPath, ["branch", "--show-current"]);
  const status = git(repoPath, ["status", "--porcelain"]);
  const isDirty = status.length > 0;

  // ahead of main — fallback til "0" hvis ikke kan beregne
  let aheadOfMain = 0;
  try {
    const baseRef = pickBaseRef(repoPath);
    if (baseRef) {
      const out = git(repoPath, ["rev-list", "--count", `${baseRef}..HEAD`]);
      aheadOfMain = parseInt(out, 10) || 0;
    }
  } catch {
    /* ignore — branch kan være selve main */
  }

  // Sidste commit + de seneste 10
  const logFormat = "%H%x09%s%x09%cI%x09%cr";
  const logRaw = git(repoPath, [
    "log",
    "-10",
    `--pretty=format:${logFormat}`,
  ]);
  const commits = logRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, message, date, relativeDate] = line.split("\t");
      return { hash: hash.slice(0, 7), message, date, relativeDate };
    });
  const lastCommit = commits[0];
  if (!lastCommit) throw new Error("intet commit-log fundet");

  return {
    branch: branch || "(detached)",
    isDirty,
    aheadOfMain,
    lastCommit,
    recentCommits: commits,
  };
}

function pickBaseRef(repoPath: string): string | null {
  // Try main first, fall back to master
  try {
    git(repoPath, ["rev-parse", "--verify", "origin/main"]);
    return "origin/main";
  } catch {
    /* fall through */
  }
  try {
    git(repoPath, ["rev-parse", "--verify", "origin/master"]);
    return "origin/master";
  } catch {
    /* fall through */
  }
  try {
    git(repoPath, ["rev-parse", "--verify", "main"]);
    return "main";
  } catch {
    /* fall through */
  }
  return null;
}

// --------------------------------------------------------------------------
// Memory-parser
// --------------------------------------------------------------------------

function readMemoryInfo(path: string): MemoryInfo {
  const raw = readFileSync(path, "utf8");
  return {
    headline: extractHeadline(raw),
    backlog: extractBacklog(raw),
    recentSessionLog: extractRecentSessionLog(raw, 5),
  };
}

function extractHeadline(raw: string): string {
  // Find første betydende sætning (skip H1 + metadata-blok)
  const lines = raw.split("\n");
  let inMetadata = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("# ")) continue;
    if (line.startsWith("**Projekt-")) inMetadata = true;
    if (inMetadata && line.startsWith("---")) {
      inMetadata = false;
      continue;
    }
    if (inMetadata) continue;
    // Skip "## Hvad det er"-typen overskrifter — tag næste linje
    if (line.startsWith("##")) continue;
    if (line.startsWith("---")) continue;
    return line.slice(0, 240);
  }
  return "";
}

function extractBacklog(raw: string): string[] {
  // Find sektion "Stadig åbent" eller "Backlog" eller "Næste skridt"
  const sectionRegexes = [
    /^#+ +Stadig åbent.*$/im,
    /^#+ +Backlog.*$/im,
    /^#+ +Næste skridt.*$/im,
    /^#+ +TODO.*$/im,
  ];
  let startIdx = -1;
  for (const r of sectionRegexes) {
    const m = raw.match(r);
    if (m && m.index !== undefined) {
      startIdx = m.index;
      break;
    }
  }
  if (startIdx === -1) return [];

  // Slut ved næste ## eller --- eller filens slut
  const remaining = raw.slice(startIdx);
  const lines = remaining.split("\n");
  const items: string[] = [];
  let started = false;
  for (const lineRaw of lines) {
    const line = lineRaw.trimEnd();
    if (!started) {
      if (line.startsWith("#")) {
        started = true;
        continue;
      }
    }
    if (started) {
      // Næste section eller divider stopper os
      if (/^#+ /.test(line) && !line.startsWith("####")) break;
      if (line.startsWith("---")) break;
      // Bullet item: "- ", "* ", "1. "
      const m = line.match(/^\s*[-*]\s+(.+)$/);
      if (m) {
        // Drop "✅ "-prefix
        const text = m[1].replace(/^✅\s+/, "").trim();
        if (text && !text.startsWith("~~")) {
          items.push(text);
        }
      }
    }
    if (items.length >= 12) break;
  }
  return items;
}

function extractRecentSessionLog(raw: string, limit: number): Array<{ date: string; text: string }> {
  // Format: "- **YYYY-MM-DD** · [...] · beskrivelse"
  const lines = raw.split("\n");
  const entries: Array<{ date: string; text: string }> = [];
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s+\*\*(\d{4}-\d{2}-\d{2})(?:[^*]*)\*\*\s*[·\-:]?\s*(.+)$/);
    if (m) {
      const date = m[1];
      // Strip indlejret [hash]-tag der typisk står først
      const text = m[2].replace(/^\[[^\]]+\]\s*[·\-:]?\s*/, "").trim();
      entries.push({ date, text: text.slice(0, 400) });
    }
  }
  // Sortér descending efter dato og tag de seneste
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries.slice(0, limit);
}
