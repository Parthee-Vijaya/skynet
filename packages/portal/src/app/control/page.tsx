"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface FileRoot {
  id: string;
  name: string;
  path: string;
  icon?: string;
}

interface FileEntry {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number;
  mtime: number;
  ext: string;
  rel: string;
}

interface DirListing {
  root: FileRoot;
  rel: string;
  crumbs: Array<{ name: string; rel: string }>;
  entries: FileEntry[];
  absolute: string;
}

interface FilePreview {
  kind: "text" | "image" | "binary";
  content?: string;
  truncated?: boolean;
  size: number;
  mime?: string;
  name: string;
  rel: string;
  ext: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtMtime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `i dag ${d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" });
}

function iconFor(entry: FileEntry): string {
  if (entry.type === "directory") return "📁";
  if (entry.type === "symlink") return "🔗";
  const ext = entry.ext;
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(ext)) return "🖼";
  if ([".md", ".mdx", ".txt"].includes(ext)) return "📝";
  if ([".json", ".yml", ".yaml", ".toml"].includes(ext)) return "⚙️";
  if ([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"].includes(ext)) return "📜";
  if ([".html", ".htm", ".css", ".scss"].includes(ext)) return "🎨";
  if ([".py", ".rb", ".go", ".rs"].includes(ext)) return "🐍";
  if ([".sh", ".bash", ".zsh"].includes(ext)) return "⌨️";
  if ([".pdf"].includes(ext)) return "📕";
  if ([".zip", ".tar", ".gz", ".7z"].includes(ext)) return "📦";
  if ([".log", ".plist"].includes(ext)) return "📋";
  return "📄";
}

export default function ControlPage() {
  const [roots, setRoots] = useState<FileRoot[]>([]);
  const [activeRoot, setActiveRoot] = useState<string>("");
  const [relPath, setRelPath] = useState<string>("");
  const [listing, setListing] = useState<DirListing | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [loadingDir, setLoadingDir] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load roots on mount
  useEffect(() => {
    fetch("/api/control/files", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setRoots(d.roots ?? []);
        if (!activeRoot && d.roots?.length) setActiveRoot(d.roots[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "fejl"));
  }, [activeRoot]);

  // Load listing when root/path changes
  const loadListing = useCallback(
    async (rootId: string, path: string) => {
      if (!rootId) return;
      setLoadingDir(true);
      setError(null);
      try {
        const url = `/api/control/files?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(
          path
        )}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? `HTTP ${res.status}`);
        }
        const d = await res.json();
        setListing(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "fejl");
        setListing(null);
      } finally {
        setLoadingDir(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeRoot) loadListing(activeRoot, relPath);
  }, [activeRoot, relPath, loadListing]);

  // Preview
  useEffect(() => {
    if (!selected || !activeRoot) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    fetch(
      `/api/control/files/preview?root=${encodeURIComponent(activeRoot)}&path=${encodeURIComponent(
        selected
      )}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setPreview(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "preview-fejl"))
      .finally(() => setLoadingPreview(false));
  }, [selected, activeRoot]);

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.type === "directory") {
      setRelPath(entry.rel);
      setSelected(null);
    } else {
      setSelected(entry.rel);
    }
  };

  const goUp = () => {
    if (!relPath) return;
    const parts = relPath.split("/").filter(Boolean);
    parts.pop();
    setRelPath(parts.join("/"));
    setSelected(null);
  };

  const crumbs = listing?.crumbs ?? [];

  const selectedEntry = useMemo(() => {
    if (!selected || !listing) return null;
    return listing.entries.find((e) => e.rel === selected) ?? null;
  }, [selected, listing]);

  return (
    <div className="min-h-screen bg-[#0a0f12] text-neutral-100">
      {/* Topbar */}
      <header className="border-b border-cyan-400/15 bg-[#0d1518]/60 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="text-[11px] font-mono text-cyan-400/80 hover:text-cyan-300 uppercase tracking-[0.2em]"
          >
            ← Dashboard
          </Link>
          <span className="text-neutral-700">·</span>
          <h1 className="text-sm sm:text-base text-neutral-100 font-mono tracking-wide truncate">
            <span className="text-cyan-400/60">S.K.Y.N.E.T.</span> Filbrowser
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/chat"
            className="text-[11px] font-mono px-2 py-1 rounded border border-neutral-800 hover:border-cyan-400/30 text-neutral-400 hover:text-cyan-300"
          >
            Chat
          </Link>
          <Link
            href="/settings"
            className="text-[11px] font-mono px-2 py-1 rounded border border-neutral-800 hover:border-cyan-400/30 text-neutral-400 hover:text-cyan-300"
          >
            Settings
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_minmax(0,1fr)] min-h-[calc(100vh-57px)]">
        {/* Roots sidebar */}
        <aside className="border-r border-neutral-900 bg-[#0b1114] p-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 mb-2 px-1">
            Roots
          </div>
          <nav className="space-y-0.5">
            {roots.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setActiveRoot(r.id);
                  setRelPath("");
                  setSelected(null);
                }}
                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  activeRoot === r.id
                    ? "bg-cyan-400/10 text-cyan-100 border border-cyan-400/30"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 border border-transparent"
                }`}
              >
                <span className="text-base leading-none">{r.icon ?? "📂"}</span>
                <span className="truncate flex-1">{r.name}</span>
              </button>
            ))}
          </nav>

          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 mt-6 mb-2 px-1">
            Info
          </div>
          <div className="px-1 text-[10px] text-neutral-500 leading-relaxed">
            Read-only. Kun whitelistede stier. Ret i settings hvis du vil tilføje roots.
          </div>
        </aside>

        {/* Directory listing */}
        <section className="border-r border-neutral-900 flex flex-col min-h-0">
          {/* Breadcrumb bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-900 bg-[#0a0f12] flex-wrap">
            <button
              onClick={goUp}
              disabled={!relPath}
              className="px-1.5 py-0.5 rounded border border-neutral-800 text-neutral-500 hover:text-cyan-300 hover:border-cyan-400/40 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
              title="Op en mappe"
            >
              ↑
            </button>
            <button
              onClick={() => {
                setRelPath("");
                setSelected(null);
              }}
              className="text-xs font-mono text-cyan-400/80 hover:text-cyan-300"
            >
              {listing?.root.icon} {listing?.root.name}
            </button>
            {crumbs.map((c) => (
              <span key={c.rel} className="flex items-center gap-2">
                <span className="text-neutral-700">/</span>
                <button
                  onClick={() => {
                    setRelPath(c.rel);
                    setSelected(null);
                  }}
                  className="text-xs font-mono text-neutral-300 hover:text-cyan-300"
                >
                  {c.name}
                </button>
              </span>
            ))}
          </div>

          {/* Entries */}
          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="m-4 px-3 py-2 rounded border border-rose-500/30 bg-rose-950/30 text-xs text-rose-300">
                {error}
              </div>
            )}
            {loadingDir && (
              <div className="p-6 text-center text-xs text-neutral-500">indlæser…</div>
            )}
            {!loadingDir && listing && listing.entries.length === 0 && (
              <div className="p-6 text-center text-xs text-neutral-500">tom mappe</div>
            )}
            {!loadingDir && listing && (
              <ul className="divide-y divide-neutral-900">
                {listing.entries.map((e) => {
                  const isSelected = selected === e.rel;
                  return (
                    <li key={e.rel}>
                      <button
                        onClick={() => handleEntryClick(e)}
                        onDoubleClick={() => {
                          if (e.type === "directory") setRelPath(e.rel);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-cyan-400/5 transition-colors ${
                          isSelected ? "bg-cyan-400/10" : ""
                        }`}
                      >
                        <span className="text-lg shrink-0 w-5 text-center">{iconFor(e)}</span>
                        <span
                          className={`flex-1 min-w-0 text-sm truncate ${
                            e.type === "directory"
                              ? "text-cyan-100 font-medium"
                              : isSelected
                              ? "text-cyan-50"
                              : "text-neutral-200"
                          }`}
                        >
                          {e.name}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-500 shrink-0 w-20 text-right">
                          {e.type === "directory" ? "" : fmtSize(e.size)}
                        </span>
                        <span className="hidden sm:inline text-[10px] font-mono text-neutral-600 shrink-0 w-28 text-right">
                          {fmtMtime(e.mtime)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Status bar */}
          <div className="border-t border-neutral-900 px-4 py-1.5 text-[10px] font-mono text-neutral-600 truncate">
            {listing?.absolute ?? ""}
            {listing ? ` · ${listing.entries.length} items` : ""}
          </div>
        </section>

        {/* Preview pane */}
        <section className="flex flex-col min-h-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-xs text-neutral-600 p-6 text-center">
              <div>
                <div className="text-4xl mb-3 opacity-40">👁</div>
                <div>Klik på en fil for at forhåndsvise</div>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-neutral-900 bg-[#0a0f12] flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-cyan-100 truncate">
                    {selectedEntry?.name ?? preview?.name}
                  </div>
                  <div className="text-[10px] font-mono text-neutral-500 truncate">
                    {preview?.ext} · {preview ? fmtSize(preview.size) : "…"}
                    {preview?.truncated && (
                      <span className="ml-2 text-amber-400">(trunkeret til 2 MB)</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-neutral-500 hover:text-neutral-200 text-sm"
                  title="Luk"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-[#07090b]">
                {loadingPreview && (
                  <div className="p-6 text-center text-xs text-neutral-500">indlæser…</div>
                )}
                {preview?.kind === "text" && preview.content != null && (
                  <pre className="p-4 text-[11px] font-mono text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
                    {preview.content}
                  </pre>
                )}
                {preview?.kind === "image" && (
                  <div className="p-4 flex items-center justify-center bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22><rect width=%2210%22 height=%2210%22 fill=%22%23111%22/><rect x=%2210%22 y=%2210%22 width=%2210%22 height=%2210%22 fill=%22%23111%22/></svg>')]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/control/files/raw?root=${encodeURIComponent(
                        activeRoot
                      )}&path=${encodeURIComponent(selected)}`}
                      alt={preview.name}
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  </div>
                )}
                {preview?.kind === "binary" && (
                  <div className="p-6 text-center text-xs text-neutral-500 space-y-2">
                    <div className="text-4xl opacity-40">🗄</div>
                    <div>Binær fil — ingen preview tilgængelig</div>
                    <div className="font-mono text-[10px] text-neutral-600">
                      {preview.mime} · {fmtSize(preview.size)}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
