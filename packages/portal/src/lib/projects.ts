/**
 * Projects-registry — KLIENT-SAFE typer og defaults.
 *
 * En "projekt" er et af Parthees Claude Code-drevne arbejder (Skynet, Saga,
 * Bifrost/Grey Skull, Heimdall, …). Hver entry kender sin repo-sti + sin
 * vidensbase-memory-fil. Server-funktioner i `projects.server.ts` læser dem
 * og returnerer status, recent commits, og backlog-uddrag.
 *
 * Dette modul må importeres fra både server- og klient-komponenter. Læsning
 * af disk-tilstand ligger i `projects.server.ts`.
 */

export type ProjectStatus = "active" | "planned" | "archived";

export interface ProjectEntry {
  id: string;
  /** Vist på kortet. */
  name: string;
  /** Én-linje pitch — vist som underrubrik. */
  description: string;
  /** Unicode-symbol eller emoji. */
  icon: string;
  /** Bestemmer farve på status-badge. */
  status: ProjectStatus;
  /** Absolut sti til git-repo'et. Undladt for planned. */
  repoPath?: string;
  /** Absolut sti til vidensbase-memory-fil. Undladt hvis intet memory. */
  memoryPath?: string;
  /** Matcher AppEntry.id i apps.ts hvis projektet har et live web-UI. */
  appId?: string;
  /** owner/name format — bruges til GitHub-link på kortet. */
  githubRepo?: string;
  /** Vist som chips. Bruges også til filtre senere. */
  tags?: string[];
}

const ROOT = "/Users/parthee/Desktop/Claude/projekter/aktive";
const VIDENSBASE = "/Users/parthee/Desktop/Claude/vidensbase/projekter";

export const DEFAULT_PROJECTS: ProjectEntry[] = [
  {
    id: "skynet",
    name: "Skynet",
    description: "Personlig intelligens-platform · cockpit, automations, agents, chat, firewall",
    icon: "◉",
    status: "active",
    repoPath: `${ROOT}/skynet`,
    memoryPath: `${VIDENSBASE}/skynet.md`,
    appId: "skynet",
    githubRepo: "Parthee-Vijaya/skynet",
    tags: ["Next.js", "TypeScript", "monorepo"],
  },
  {
    id: "grey-skull",
    name: "Grey Skull",
    description: "Digital tvilling + assistent · iMessage + SMS · tidligere Bifrost",
    icon: "◆",
    status: "active",
    repoPath: `${ROOT}/grey-skull`,
    memoryPath: `${VIDENSBASE}/grey-skull.md`,
    appId: "bifrost",
    githubRepo: "Parthee-Vijaya/grey-skull",
    tags: ["TypeScript", "iMessage", "SMS"],
  },
  {
    id: "saga",
    name: "Saga",
    description: "Mac voice assistant · hold ⌥ → dansk tale → cursor · CanaryKit CoreML",
    icon: "🎙",
    status: "active",
    repoPath: `${ROOT}/saga`,
    memoryPath: `${VIDENSBASE}/saga.md`,
    appId: "saga",
    githubRepo: "Parthee-Vijaya/saga-mac",
    tags: ["Swift", "macOS", "CoreML"],
  },
  {
    id: "heimdall",
    name: "Heimdall",
    description: "Daglig cockpit til medie + system — brugervenlig version af Skynet",
    icon: "🛡",
    status: "active",
    repoPath: `${ROOT}/heimdall`,
    appId: "heimdall",
    tags: ["Next.js", "Jellyfin", "Sonarr", "Radarr"],
  },
  {
    id: "odin",
    name: "Odin",
    description: "Personlig RAG-vidensbase som Mac Studio-service · all-fader til alle dine kilder",
    icon: "◈",
    status: "active",
    repoPath: `${ROOT}/odin`,
    memoryPath: `${VIDENSBASE}/odin.md`,
    appId: "odin",
    tags: ["RAG", "sqlite-vec", "Python"],
  },
  {
    id: "mimir",
    name: "Mímir",
    description: "Lokal personlighedsprofil-webapp · DISC + Whole Brain + Enneagram",
    icon: "✦",
    status: "active",
    repoPath: `${ROOT}/mimir`,
    memoryPath: `${VIDENSBASE}/mimir.md`,
    appId: "mimir",
    tags: ["Next.js", "Recharts", "personlighed"],
  },
  {
    id: "judge-dredd",
    name: "Tyr",
    description: "Kommunal AI-compliance til Kalundborg · videnbase + AI-løsninger + ressourcer",
    icon: "⚖",
    status: "active",
    repoPath: `${ROOT}/judge-dredd`,
    memoryPath: `${VIDENSBASE}/tyr.md`,
    appId: "judge-dredd",
    githubRepo: "Parthee-Vijaya/Judge_dredd",
    tags: ["FastAPI", "Next.js", "LM Studio"],
  },
  {
    id: "research-agent",
    name: "Research-agent",
    description: "Lokal email-research-agent · TypeScript + deepagents mod LM Studio",
    icon: "✉",
    status: "active",
    repoPath: `${ROOT}/research-agent`,
    memoryPath: `${VIDENSBASE}/research-agent.md`,
    appId: "research-agent",
    tags: ["TypeScript", "LangChain", "IMAP"],
  },
  {
    id: "canary-coreml",
    name: "Canary CoreML",
    description: "On-device konvertering af NVIDIA canary-1b-v2 til CoreML · 25 EU-sprog inkl. dansk",
    icon: "◊",
    status: "active",
    repoPath: `${ROOT}/canary-coreml`,
    memoryPath: `${VIDENSBASE}/canary-coreml.md`,
    githubRepo: "Parthee-Vijaya/canary-coreml",
    tags: ["Swift", "Python", "ASR"],
  },
  {
    id: "hviske-coreml",
    name: "Hviske CoreML",
    description: "On-device CoreML af syvai/hviske-v3 · dansk-først ASR · opt-in i Saga",
    icon: "◊",
    status: "active",
    repoPath: `${ROOT}/hviske-coreml`,
    memoryPath: `${VIDENSBASE}/hviske-coreml.md`,
    tags: ["Swift", "Whisper", "ASR"],
  },
  // Planned — endnu ikke på disk
  {
    id: "sif",
    name: "Sif",
    description: "Planlagt projekt · ikke startet endnu",
    icon: "◇",
    status: "planned",
    tags: ["TBD"],
  },
];

export function statusTone(status: ProjectStatus): "ok" | "warn" | "dim" {
  if (status === "active") return "ok";
  if (status === "planned") return "warn";
  return "dim";
}
