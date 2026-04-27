"use client";
import { useEffect, useRef, useState } from "react";
import { Section } from "../primitives";
import type { TrendingRepo, TrendingResponse } from "@/app/api/github/trending/route";

// ── GitHub language colours (subset) ───────────────────────────────────────
const LANG_COLOR: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Rust: "#dea584",
  Go: "#00add8",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Java: "#b07219",
  Kotlin: "#a97bff",
  Swift: "#f05138",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Scala: "#c22d40",
  Zig: "#ec915c",
  Lua: "#000080",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  R: "#198ce7",
  Dart: "#00b4ab",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};

function langDot(lang: string | null) {
  if (!lang) return null;
  const color = LANG_COLOR[lang] ?? "#6b6b6b";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        marginRight: 5,
        flexShrink: 0,
      }}
    />
  );
}

function fmtStars(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "m";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function ageLabel(fetchedAt: number): string {
  const s = Math.round((Date.now() - fetchedAt) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

// ── Polling hook with change-tracking ──────────────────────────────────────
function useTrending(intervalMs = 5 * 60_000) {
  const [state, setState] = useState<TrendingResponse | null>(null);
  const [error, setError] = useState(false);
  const [changedIds, setChangedIds] = useState<Set<number>>(new Set());
  const prevIdsRef = useRef<number[]>([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/github/trending");
        if (!res.ok) throw new Error("non-ok");
        const data: TrendingResponse = await res.json();
        if (!alive) return;

        // Detect which repos changed position or are new
        const newIds = data.repos.map((r) => r.id);
        const changed = new Set(
          newIds.filter((id, i) => prevIdsRef.current[i] !== id)
        );
        prevIdsRef.current = newIds;

        setState(data);
        setChangedIds(changed);
        setError(false);

        // Clear highlight after 2s
        if (changed.size > 0) {
          setTimeout(() => setChangedIds(new Set()), 2000);
        }
      } catch {
        if (alive) setError(true);
      }
    }

    load();
    const id = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);

  return { data: state, error, changedIds };
}

// ── Age ticker updates every 30s ───────────────────────────────────────────
function useAgeTicker() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

// ── Component ──────────────────────────────────────────────────────────────
export function TopReposWidget() {
  const { data, error, changedIds } = useTrending();
  const ageTick = useAgeTicker(); // triggers re-render for "refreshed X ago"
  void ageTick;

  const repos = data?.repos ?? [];
  const age = data?.fetchedAt ? ageLabel(data.fetchedAt) : "—";

  return (
    <Section
      title="github · trending"
      right={
        <span>
          {error ? (
            <span style={{ color: "#d87373" }}>offline</span>
          ) : data ? (
            <span>
              refreshed {age}
              <span style={{ color: "#3a3a3a", margin: "0 6px" }}>·</span>
              last 7d
            </span>
          ) : (
            <span style={{ color: "#525252" }}>henter…</span>
          )}
        </span>
      }
    >
      <table
        style={{
          width: "100%",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 11,
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr
            style={{
              color: "#525252",
              borderBottom: "1px dashed #262626",
            }}
          >
            <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 400, width: 26 }}>#</th>
            <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 400 }}>repository</th>
            <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 400, width: 70 }}>lang</th>
            <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 400, width: 48 }}>★</th>
            <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 400, width: 48 }}>+dag</th>
            <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 400, width: 40 }}>badge</th>
          </tr>
        </thead>
        <tbody>
          {!data && !error && (
            <tr>
              <td colSpan={6} style={{ paddingTop: 16, color: "#3a3a3a" }}>
                henter repos…
              </td>
            </tr>
          )}
          {error && repos.length === 0 && (
            <tr>
              <td colSpan={6} style={{ paddingTop: 16, color: "#d87373", fontSize: 11, lineHeight: 1.5 }}>
                <div>GitHub Search utilgængelig</div>
                <div style={{ color: "#6b6b6b", fontSize: 10, marginTop: 3 }}>
                  Anonymous tier er 10 req/min — sæt en GitHub PAT under{" "}
                  <a href="/settings" style={{ color: "#9bd0ff" }}>/settings</a> for 30 req/min.
                </div>
              </td>
            </tr>
          )}
          {repos.map((repo) => {
            const highlight = changedIds.has(repo.id);
            return (
              <tr
                key={repo.id}
                onClick={() => window.open(repo.url, "_blank")}
                style={{
                  borderBottom: "1px dashed #1c1c1c",
                  cursor: "pointer",
                  background: highlight ? "rgba(100,165,255,0.05)" : "transparent",
                  transition: "background 600ms ease",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLTableRowElement).style.background =
                    "rgba(255,255,255,0.03)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLTableRowElement).style.background =
                    highlight ? "rgba(100,165,255,0.05)" : "transparent")
                }
              >
                {/* Rank */}
                <td
                  style={{
                    padding: "5px 6px 5px 0",
                    color: "#3a3a3a",
                    tabularNums: true,
                    verticalAlign: "top",
                  } as React.CSSProperties}
                >
                  {String(repo.rank).padStart(2, "0")}
                </td>

                {/* Name + description */}
                <td style={{ padding: "5px 8px 5px 0", verticalAlign: "top" }}>
                  <div style={{ color: "#9bd0ff" }}>
                    <span style={{ color: "#525252" }}>{repo.owner}/</span>
                    {repo.name}
                  </div>
                  {repo.description && (
                    <div
                      style={{
                        color: "#525252",
                        fontSize: 10,
                        marginTop: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 260,
                      }}
                    >
                      {repo.description}
                    </div>
                  )}
                </td>

                {/* Language */}
                <td
                  style={{
                    padding: "5px 8px 5px 0",
                    verticalAlign: "top",
                    color: "#6b6b6b",
                    fontSize: 10,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center" }}>
                    {langDot(repo.language)}
                    {repo.language ?? "—"}
                  </span>
                </td>

                {/* Stars */}
                <td
                  style={{
                    padding: "5px 8px 5px 0",
                    verticalAlign: "top",
                    textAlign: "right",
                    color: "#e5e5e5",
                    tabularNums: true,
                  } as React.CSSProperties}
                >
                  {fmtStars(repo.stars)}
                </td>

                {/* Stars today */}
                <td
                  style={{
                    padding: "5px 8px 5px 0",
                    verticalAlign: "top",
                    textAlign: "right",
                    tabularNums: true,
                  } as React.CSSProperties}
                >
                  {repo.starsToday !== null && repo.starsToday > 0 ? (
                    <span style={{ color: "#7dd67d", fontSize: 10 }}>+{fmtStars(repo.starsToday)}</span>
                  ) : repo.starsToday === 0 ? (
                    <span style={{ color: "#3a3a3a", fontSize: 10 }}>—</span>
                  ) : (
                    <span style={{ color: "#3a3a3a", fontSize: 10 }}>…</span>
                  )}
                </td>

                {/* Badge */}
                <td
                  style={{
                    padding: "5px 0 5px 0",
                    verticalAlign: "top",
                    textAlign: "right",
                  }}
                >
                  {repo.isHot ? (
                    <span
                      style={{
                        fontSize: 9,
                        color: "#ff7043",
                        letterSpacing: "0.08em",
                        fontWeight: 500,
                      }}
                    >
                      HOT
                    </span>
                  ) : repo.isNew ? (
                    <span
                      style={{
                        fontSize: 9,
                        color: "#7dd67d",
                        letterSpacing: "0.08em",
                      }}
                    >
                      NEW
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          color: "#3a3a3a",
          fontFamily: "inherit",
        }}
      >
        github search · created last 7 days · sorted by ★ · klik for at åbne repo
      </div>
    </Section>
  );
}
