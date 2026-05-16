"use client";

import { useEffect, useMemo, useState } from "react";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section, Dot } from "@/components/minimal/primitives";
import { usePoll } from "@/hooks/usePoll";
import type { WatchlistData, WatchlistItem, WatchlistStatus } from "@/lib/watchlist";

interface LookupHit {
  service: "sonarr" | "radarr";
  type: "tv" | "movie";
  title: string;
  year?: number;
  externalId: number;
  imdbId?: string;
  poster?: string;
  overview?: string;
  alreadyAdded: boolean;
  serviceId?: number;
  network?: string;
  runtime?: number;
  status?: string;
}

const STATUS_LABEL: Record<WatchlistStatus, string> = {
  pending: "afventer",
  downloading: "henter",
  partial: "delvis",
  ready: "klar",
};

const STATUS_TONE: Record<WatchlistStatus, "ok" | "warn" | "bad" | "dim"> = {
  pending: "dim",
  downloading: "warn",
  partial: "warn",
  ready: "ok",
};

type FilterStatus = "all" | WatchlistStatus;
type FilterType = "all" | "tv" | "movie";

export default function WatchlistPage() {
  const { data } = usePoll<WatchlistData>("/api/watchlist", 30_000);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [lookupHits, setLookupHits] = useState<LookupHit[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Debounced lookup
  useEffect(() => {
    if (search.trim().length < 2) {
      setLookupHits(null);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setLookupLoading(true);
      try {
        const params = new URLSearchParams({ q: search.trim() });
        if (filterType !== "all") params.set("type", filterType);
        const res = await fetch(`/api/watchlist/lookup?${params}`, { signal: ctrl.signal });
        const json = await res.json() as { hits: LookupHit[] };
        setLookupHits(json.hits ?? []);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setLookupHits([]);
        }
      } finally {
        setLookupLoading(false);
      }
    }, 350);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [search, filterType]);

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((it) => {
      if (filterStatus !== "all" && it.status !== filterStatus) return false;
      if (filterType !== "all" && it.type !== filterType) return false;
      return true;
    });
  }, [data, filterStatus, filterType]);

  async function handleAdd(hit: LookupHit) {
    setAdding(hit.externalId);
    setAddError(null);
    setAddSuccess(null);
    try {
      const res = await fetch("/api/watchlist/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: hit.type,
          externalId: hit.externalId,
          title: hit.title,
          year: hit.year,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setAddError(json.error ?? `Fejl: HTTP ${res.status}`);
      } else {
        setAddSuccess(`Tilføjet: ${hit.title}`);
        setSearch("");
        setLookupHits(null);
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Netværksfejl");
    } finally {
      setAdding(null);
      setTimeout(() => setAddSuccess(null), 4000);
    }
  }

  async function handleDelete(item: WatchlistItem) {
    const ok = confirm(`Fjern "${item.title}" fra ${item.service}? (filer bevares)`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/watchlist/${item.service}/${item.serviceId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert(`Kunne ikke fjerne: ${json.error ?? res.status}`);
      }
    } catch (err) {
      alert(`Fejl: ${String(err)}`);
    }
  }

  const sonarrOnline = data?.online.sonarr ?? false;
  const radarrOnline = data?.online.radarr ?? false;
  const counts = data?.counts;

  return (
    <MinimalPageLayout active="watchlist">
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px 60px" }}>
        <Section
          title="watchlist · sonarr + radarr"
          right={
            <span className="font-mono text-[10px]">
              <Dot tone={sonarrOnline ? "ok" : "bad"} />sonarr
              <span className="mx-1.5 text-neutral-700">·</span>
              <Dot tone={radarrOnline ? "ok" : "bad"} />radarr
              {counts && (
                <>
                  <span className="mx-1.5 text-neutral-700">·</span>
                  <span className="text-neutral-500">{counts.total} items</span>
                </>
              )}
            </span>
          }
        >
          {/* Søgefelt + tilføj */}
          <div className="mb-5">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="søg titel for at tilføje (fx 'severance')…"
                className="w-full px-3 py-2 bg-neutral-900/40 border border-neutral-800 focus:border-neutral-600 outline-none font-mono text-[12px] text-neutral-100 placeholder:text-neutral-700 rounded-sm"
              />
              {lookupLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-600 font-mono">
                  søger…
                </span>
              )}
            </div>

            {addError && (
              <div className="mt-2 px-3 py-2 bg-rose-950/30 border border-rose-900/40 text-rose-300 text-[11px] font-mono rounded-sm">
                {addError}
              </div>
            )}
            {addSuccess && (
              <div className="mt-2 px-3 py-2 bg-emerald-950/30 border border-emerald-900/40 text-emerald-300 text-[11px] font-mono rounded-sm">
                ✓ {addSuccess}
              </div>
            )}

            {/* Lookup-resultater */}
            {lookupHits && lookupHits.length > 0 && (
              <div className="mt-3 space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {lookupHits.map((hit) => (
                  <div
                    key={`${hit.service}-${hit.externalId}`}
                    className="flex gap-3 p-2 bg-neutral-950/50 border border-neutral-900 rounded-sm"
                  >
                    {hit.poster ? (
                      <img
                        src={hit.poster}
                        alt=""
                        className="w-12 h-[72px] object-cover rounded-sm shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-12 h-[72px] bg-neutral-900 rounded-sm shrink-0 flex items-center justify-center text-[18px] text-neutral-700">
                        {hit.type === "tv" ? "📺" : "🎬"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[13px] text-neutral-100 truncate">{hit.title}</span>
                        {hit.year && (
                          <span className="font-mono text-[10px] text-neutral-600">({hit.year})</span>
                        )}
                        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-700 ml-auto shrink-0">
                          {hit.type === "tv" ? "serie" : "film"}
                        </span>
                      </div>
                      {hit.overview && (
                        <div className="font-mono text-[10px] text-neutral-500 mt-1 line-clamp-2 leading-snug">
                          {hit.overview}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-neutral-700">
                        {hit.network && <span>{hit.network}</span>}
                        {hit.runtime && <span>· {hit.runtime} min</span>}
                        {hit.status && <span>· {hit.status}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center">
                      {hit.alreadyAdded ? (
                        <span className="font-mono text-[10px] text-emerald-600">✓ tilføjet</span>
                      ) : (
                        <button
                          onClick={() => handleAdd(hit)}
                          disabled={adding === hit.externalId}
                          className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-200 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 disabled:opacity-50 rounded-sm"
                        >
                          {adding === hit.externalId ? "tilføjer…" : "+ tilføj"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {lookupHits && lookupHits.length === 0 && search.length >= 2 && !lookupLoading && (
              <div className="mt-2 font-mono text-[11px] text-neutral-600">
                ingen resultater for &quot;{search}&quot;
              </div>
            )}
          </div>

          {/* Filtre */}
          <div className="flex flex-wrap items-center gap-1 mb-4">
            <span className="font-mono text-[10px] text-neutral-700 mr-2 uppercase tracking-widest">filter:</span>
            {(["all", "pending", "downloading", "partial", "ready"] as const).map((s) => (
              <FilterChip
                key={s}
                active={filterStatus === s}
                label={s === "all" ? "alle" : STATUS_LABEL[s]}
                count={s === "all" ? counts?.total : counts?.[s]}
                onClick={() => setFilterStatus(s)}
              />
            ))}
            <span className="mx-2 text-neutral-800">|</span>
            {(["all", "tv", "movie"] as const).map((t) => (
              <FilterChip
                key={t}
                active={filterType === t}
                label={t === "all" ? "begge" : t === "tv" ? "serier" : "film"}
                onClick={() => setFilterType(t)}
              />
            ))}
          </div>

          {/* Item-grid */}
          {!data ? (
            <div className="font-mono text-[11px] text-neutral-600">indlæser…</div>
          ) : filtered.length === 0 ? (
            <div className="font-mono text-[11px] text-neutral-600 py-12 text-center">
              {data.items.length === 0
                ? "ingen monitored items i Sonarr/Radarr endnu — søg ovenfor for at tilføje."
                : "ingen items matcher filtret."}
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
            >
              {filtered.map((item) => (
                <WatchlistCard key={`${item.service}-${item.serviceId}`} item={item} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {data && !data.configured.sonarr && !data.configured.radarr && (
            <div className="mt-6 font-mono text-[11px] text-neutral-600 leading-relaxed">
              Hverken Sonarr eller Radarr har API-key sat.{" "}
              <a href="/settings" className="text-neutral-400 hover:text-neutral-200">
                konfigurer i settings →
              </a>
            </div>
          )}
        </Section>
      </main>
    </MinimalPageLayout>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest border transition-colors"
      style={{
        color: active ? "#f5f5f5" : "#737373",
        background: active ? "#1c1c1c" : "transparent",
        borderColor: active ? "#404040" : "#1c1c1c",
      }}
    >
      {label}
      {typeof count === "number" && (
        <span className="ml-1.5 text-neutral-600 normal-case">{count}</span>
      )}
    </button>
  );
}

function WatchlistCard({
  item,
  onDelete,
}: {
  item: WatchlistItem;
  onDelete: (item: WatchlistItem) => void;
}) {
  const tone = STATUS_TONE[item.status];
  const label = STATUS_LABEL[item.status];

  return (
    <div className="group relative bg-neutral-950/50 border border-neutral-900 hover:border-neutral-800 rounded-sm overflow-hidden flex flex-col">
      <div className="aspect-[2/3] bg-neutral-900 relative">
        {item.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="flex items-center justify-center h-full text-[32px] text-neutral-700">
            {item.type === "tv" ? "📺" : "🎬"}
          </div>
        )}
        <div
          className="absolute top-1.5 right-1.5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest backdrop-blur-md"
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          <Dot tone={tone} />
          {label}
        </div>
        {item.status === "partial" && typeof item.progress === "number" && (
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-neutral-900/60">
            <div className="h-full bg-amber-500/70" style={{ width: `${item.progress}%` }} />
          </div>
        )}
      </div>
      <div className="p-2 flex-1 flex flex-col">
        <div className="font-mono text-[11.5px] text-neutral-100 leading-snug line-clamp-2">{item.title}</div>
        <div className="font-mono text-[9.5px] text-neutral-600 mt-0.5 flex gap-1.5">
          {item.year && <span>{item.year}</span>}
          <span className="text-neutral-800">·</span>
          <span className="uppercase tracking-widest">{item.type === "tv" ? "serie" : "film"}</span>
        </div>
        <div className="font-mono text-[9.5px] text-neutral-500 mt-1 truncate">{item.detail}</div>
        <button
          onClick={() => onDelete(item)}
          className="mt-2 self-start opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[9px] uppercase tracking-widest text-neutral-600 hover:text-rose-400"
        >
          fjern
        </button>
      </div>
    </div>
  );
}
