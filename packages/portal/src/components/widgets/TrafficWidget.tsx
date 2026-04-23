"use client";
import { useEffect, useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { TrafficData, TrafficIncident } from "@/lib/types";

const LAYERS = [
  { key: "current-roadblocks", label: "Spærret", color: "bg-rose-400", text: "text-rose-400" },
  { key: "current-blocking-roadwork", label: "Vejarbejde spær.", color: "bg-amber-400", text: "text-amber-400" },
  { key: "current-queue", label: "Kø", color: "bg-orange-400", text: "text-orange-400" },
  { key: "current-other-traffic-announcements", label: "Trafik", color: "bg-sky-400", text: "text-sky-400" },
  { key: "current-roadwork", label: "Vejarbejde", color: "bg-neutral-400", text: "text-neutral-400" },
];

const CAMERAS = [
  { id: "storebaelt-bro", label: "Storebælt · Østre pylon" },
  { id: "storebaelt-sprogo", label: "Storebælt · Sprogø" },
];

function layerLabel(key: string): string {
  return LAYERS.find((l) => l.key === key)?.label ?? key;
}
function layerText(key: string): string {
  return LAYERS.find((l) => l.key === key)?.text ?? "text-neutral-400";
}

function Webcam({ source, label }: { source: string; label: string }) {
  // Start med 0 så SSR og initial client-render matcher. Client sætter
  // derefter rigtig timestamp + intervallet i useEffect.
  const [ts, setTs] = useState(0);
  const [failed, setFailed] = useState(false);

  // Refresh the JPG every 30s (first tick sætter også en ikke-0 værdi).
  useEffect(() => {
    setTs(Date.now());
    const id = setInterval(() => setTs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative rounded-md overflow-hidden border border-cyan-400/15 bg-neutral-900 group/cam">
      {failed ? (
        <div className="aspect-[974/350] flex items-center justify-center text-xs text-neutral-500">
          Kamera ikke tilgængeligt
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/webcam/${source}?t=${ts}`}
          alt={label}
          className="w-full aspect-[974/350] object-cover transition-opacity duration-300"
          onError={() => setFailed(true)}
        />
      )}

      {/* Overlay: location label + live dot */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
        <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] font-mono text-cyan-100 tracking-wider">
          {label}
        </span>
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm">
          <span
            className="w-1.5 h-1.5 rounded-full bg-rose-400 pulse-dot"
            style={{ boxShadow: "0 0 6px #fb7185" }}
          />
          <span className="text-[9px] font-mono text-rose-200 uppercase tracking-wider">Live</span>
        </span>
      </div>

      {/* Scan-line bar bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
    </div>
  );
}

function Row({ inc }: { inc: TrafficIncident }) {
  return (
    <div className="text-xs leading-snug py-0.5">
      <span className={`font-mono text-[10px] mr-2 ${layerText(inc.layer)}`}>
        {layerLabel(inc.layer)}
      </span>
      <span className="text-neutral-300">{inc.header}</span>
    </div>
  );
}

export function TrafficWidget() {
  const { data } = usePoll<TrafficData>("/api/traffic", 5 * 60_000);
  const [camIdx, setCamIdx] = useState(0);

  const incidents = data?.incidents ?? [];
  const total = data?.total ?? 0;

  const counts: Record<string, number> = {};
  for (const inc of incidents) {
    counts[inc.layer] = (counts[inc.layer] ?? 0) + 1;
  }
  const barTotal = Math.max(1, incidents.length);

  const cam = CAMERAS[camIdx];

  return (
    <Card
      widget="traffic"
      title="Trafik · Storebælt"
      className="sm:col-span-2 lg:col-span-6"
      action={
        <span className="text-[10px] font-mono text-cyan-400/60">
          {total} aktive · DK
        </span>
      }
    >
      <Webcam source={cam.id} label={cam.label} />

      {/* Camera switcher */}
      <div className="mt-2 flex items-center gap-1">
        {CAMERAS.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setCamIdx(i)}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              camIdx === i
                ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200"
                : "border-cyan-400/15 text-neutral-400 hover:border-cyan-400/40"
            }`}
          >
            {c.label.replace("Storebælt · ", "")}
          </button>
        ))}
      </div>

      {/* Stacked bar of incident categories */}
      {incidents.length > 0 && (
        <div className="mt-3">
          <div className="w-full h-2 flex rounded-full overflow-hidden bg-neutral-800/60">
            {LAYERS.map((l) => {
              const n = counts[l.key] ?? 0;
              if (n === 0) return null;
              return (
                <div
                  key={l.key}
                  className={`${l.color} transition-all duration-500`}
                  style={{ width: `${(n / barTotal) * 100}%` }}
                  title={`${l.label}: ${n}`}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] font-mono">
            {LAYERS.map((l) => {
              const n = counts[l.key] ?? 0;
              if (n === 0) return null;
              return (
                <span key={l.key} className={l.text}>
                  ● <span className="text-neutral-400">{l.label}</span> {n}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Incident list */}
      <div className="mt-3 pt-3 border-t border-cyan-400/10 space-y-0.5">
        {data?.error ? (
          <div className="text-xs text-rose-400/70">{data.error}</div>
        ) : incidents.length === 0 ? (
          <div className="text-xs text-neutral-500">Ingen alvorlige hændelser</div>
        ) : (
          incidents.slice(0, 3).map((inc, i) => <Row key={i} inc={inc} />)
        )}
      </div>
    </Card>
  );
}
