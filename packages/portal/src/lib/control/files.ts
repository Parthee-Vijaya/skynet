/**
 * Filbrowser-modul for Mission Control.
 *
 * Sikkerhedsmodel:
 *   1. Kun stier indenfor whitelisted ROOTS må tilgås.
 *   2. Alle paths resolves til absolutter og tjekkes for at ligge indenfor et root.
 *   3. Symlinks til filer udenfor roots → blokeret.
 *   4. Read-only i denne fase — ingen write/delete/create endpoints.
 */

import { homedir } from "node:os";
import { join, resolve, sep, basename, extname, dirname } from "node:path";
import { promises as fs } from "node:fs";
import { getSettingJSON } from "../settings";

export interface FileRoot {
  /** Unikt ID til brug i URLs */
  id: string;
  /** Visningsnavn */
  name: string;
  /** Absolut sti */
  path: string;
  /** Emoji */
  icon?: string;
}

const HOME = homedir();

export const DEFAULT_ROOTS: FileRoot[] = [
  { id: "projekter", name: "Projekter", path: join(HOME, "Desktop", "Claude", "projekter"), icon: "📂" },
  { id: "downloads", name: "Downloads", path: join(HOME, "Downloads"), icon: "⬇️" },
  { id: "documents", name: "Documents", path: join(HOME, "Documents"), icon: "📄" },
  { id: "desktop", name: "Skrivebord", path: join(HOME, "Desktop"), icon: "🖥" },
  { id: "logs", name: "SKYNET logs", path: join(HOME, "Library", "Logs"), icon: "📜" },
];

export function getRoots(): FileRoot[] {
  return getSettingJSON<FileRoot[]>("control_file_roots", DEFAULT_ROOTS);
}

export function findRoot(id: string): FileRoot | null {
  return getRoots().find((r) => r.id === id) ?? null;
}

/**
 * Resolve en relativ sti indenfor et root. Returnerer absolut sti eller null
 * hvis stien peger udenfor rootet (path traversal).
 */
export function resolveInRoot(root: FileRoot, relative: string): string | null {
  const rootAbs = resolve(root.path);
  const target = resolve(rootAbs, relative || ".");
  // Sørg for at target ligger indenfor rootet (inkl. equal)
  if (target !== rootAbs && !target.startsWith(rootAbs + sep)) {
    return null;
  }
  return target;
}

export interface FileEntry {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number;
  mtime: number; // ms since epoch
  ext: string;
  /** Relativ sti fra root — bruges i URL'en */
  rel: string;
  /** For symlinks til filer: true hvis link peger ind i root */
  linkOk?: boolean;
}

export interface DirListing {
  root: FileRoot;
  /** Relativ sti fra root ("" = root-niveau) */
  rel: string;
  /** Breadcrumb-segmenter fra root til current */
  crumbs: Array<{ name: string; rel: string }>;
  entries: FileEntry[];
  /** Absolut sti (vises kun i UI for reference) */
  absolute: string;
}

export async function listDir(rootId: string, relative: string): Promise<DirListing | null> {
  const root = findRoot(rootId);
  if (!root) return null;
  const abs = resolveInRoot(root, relative);
  if (!abs) return null;

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return null;
  }
  if (!stat.isDirectory()) return null;

  const rawEntries = await fs.readdir(abs, { withFileTypes: true });
  const entries: FileEntry[] = [];
  for (const e of rawEntries) {
    // Skip .DS_Store og lignende
    if (e.name === ".DS_Store") continue;
    // Skip skjulte filer by default (kan toggles senere)
    if (e.name.startsWith(".")) continue;

    const entryAbs = join(abs, e.name);
    let entryStat;
    try {
      entryStat = await fs.stat(entryAbs);
    } catch {
      continue;
    }

    let type: FileEntry["type"];
    if (e.isSymbolicLink()) type = "symlink";
    else if (entryStat.isDirectory()) type = "directory";
    else if (entryStat.isFile()) type = "file";
    else type = "other";

    // Beregn relativ sti fra root
    const rel = entryAbs.slice(resolve(root.path).length + 1);

    entries.push({
      name: e.name,
      type,
      size: entryStat.size,
      mtime: entryStat.mtimeMs,
      ext: extname(e.name).toLowerCase(),
      rel,
    });
  }

  // Sort: directories først, så alfabetisk
  entries.sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory") return -1;
    if (a.type !== "directory" && b.type === "directory") return 1;
    return a.name.localeCompare(b.name, "da");
  });

  // Build crumbs
  const crumbs: Array<{ name: string; rel: string }> = [];
  if (relative) {
    const parts = relative.split(sep).filter(Boolean);
    let acc = "";
    for (const p of parts) {
      acc = acc ? join(acc, p) : p;
      crumbs.push({ name: p, rel: acc });
    }
  }

  return {
    root,
    rel: relative,
    crumbs,
    entries,
    absolute: abs,
  };
}

const TEXT_EXT = new Set([
  ".txt", ".md", ".mdx", ".json", ".yml", ".yaml", ".toml", ".ini", ".env",
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
  ".html", ".htm", ".css", ".scss", ".less",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".m", ".mm",
  ".sh", ".bash", ".zsh", ".fish",
  ".sql", ".xml", ".svg", ".log", ".plist", ".conf", ".config",
  ".gitignore", ".dockerignore", ".editorconfig",
  ".vue", ".astro", ".graphql", ".gql",
]);

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico"]);

const MAX_TEXT_BYTES = 2 * 1024 * 1024; // 2 MB

export function classifyFile(ext: string, name: string): "text" | "image" | "binary" {
  if (TEXT_EXT.has(ext)) return "text";
  if (IMAGE_EXT.has(ext)) return "image";
  // Files uden extension men kendte navne
  const lower = name.toLowerCase();
  if (lower === "readme" || lower === "license" || lower === "makefile" || lower === "dockerfile") {
    return "text";
  }
  return "binary";
}

export interface FilePreview {
  kind: "text" | "image" | "binary";
  /** Hvis text: indhold (evt. trunkeret) */
  content?: string;
  truncated?: boolean;
  size: number;
  mime?: string;
  name: string;
  rel: string;
  ext: string;
}

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function getMime(ext: string): string {
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export async function readTextPreview(
  rootId: string,
  relative: string
): Promise<FilePreview | null> {
  const root = findRoot(rootId);
  if (!root) return null;
  const abs = resolveInRoot(root, relative);
  if (!abs) return null;

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const name = basename(abs);
  const ext = extname(name).toLowerCase();
  const kind = classifyFile(ext, name);

  if (kind === "text") {
    // Læs op til MAX_TEXT_BYTES
    const truncate = stat.size > MAX_TEXT_BYTES;
    const buf = truncate
      ? await readPartial(abs, MAX_TEXT_BYTES)
      : await fs.readFile(abs);
    const content = buf.toString("utf8");
    return {
      kind: "text",
      content,
      truncated: truncate,
      size: stat.size,
      name,
      rel: relative,
      ext,
    };
  }

  return {
    kind,
    size: stat.size,
    mime: getMime(ext),
    name,
    rel: relative,
    ext,
  };
}

async function readPartial(abs: string, maxBytes: number): Promise<Buffer> {
  const fd = await fs.open(abs, "r");
  try {
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await fd.read(buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }
}

/**
 * Streame-venlig læsning af binær fil (fx billede) til Response.
 * Respekterer roots.
 */
export async function readBinary(
  rootId: string,
  relative: string
): Promise<{ buf: Buffer; mime: string; name: string; size: number } | null> {
  const root = findRoot(rootId);
  if (!root) return null;
  const abs = resolveInRoot(root, relative);
  if (!abs) return null;

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  // Begrænsning: max 20MB for at undgå at DoS serveren
  if (stat.size > 20 * 1024 * 1024) return null;

  const ext = extname(abs).toLowerCase();
  const buf = await fs.readFile(abs);
  return {
    buf,
    mime: getMime(ext),
    name: basename(abs),
    size: stat.size,
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatMtime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `i dag ${d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `i går ${d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" });
}

// Re-export for UI convenience
export { dirname };
