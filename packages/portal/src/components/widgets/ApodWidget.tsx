"use client";
import { useEffect, useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { DiscoverData } from "@/lib/types";

const ROTATE_MS = 60_000; // skift slide hvert minut

export function ApodWidget() {
  const { data } = usePoll<DiscoverData>("/api/discover", 20 * 60_000);
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const slides = data?.slides ?? [];
  const slide = slides[idx % Math.max(1, slides.length)];

  // Automatisk rotation
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIdx((i) => (i + 1) % slides.length);
        setExpanded(false);
        setFading(false);
      }, 400);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  const next = () => {
    if (slides.length < 2) return;
    setFading(true);
    setTimeout(() => {
      setIdx((i) => (i + 1) % slides.length);
      setExpanded(false);
      setFading(false);
    }, 250);
  };
  const prev = () => {
    if (slides.length < 2) return;
    setFading(true);
    setTimeout(() => {
      setIdx((i) => (i - 1 + slides.length) % slides.length);
      setExpanded(false);
      setFading(false);
    }, 250);
  };

  return (
    <Card
      widget="apod"
      title="Opdag · roterende"
      className="sm:col-span-2 lg:col-span-12"
      action={
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-cyan-400/60">
            {slides.length > 0 ? `${idx + 1}/${slides.length}` : ""}
          </span>
          {slides.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={prev}
                className="text-cyan-400/60 hover:text-cyan-300 text-xs px-1 transition-colors"
                title="Forrige"
              >
                ‹
              </button>
              <button
                onClick={next}
                className="text-cyan-400/60 hover:text-cyan-300 text-xs px-1 transition-colors"
                title="Næste"
              >
                ›
              </button>
            </div>
          )}
        </div>
      }
      flat
    >
      <div
        className={`transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}
      >
        {slide ? (
          <div className="space-y-3">
            {slide.imageUrl ? (
              <div className="relative rounded-md overflow-hidden border border-cyan-400/10 group/slide">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.imageUrl}
                  alt={slide.title}
                  className="w-full h-48 object-cover transition-transform duration-700 group-hover/slide:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07090b] via-transparent to-transparent pointer-events-none" />
                <div className="absolute top-2 left-2">
                  <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] font-mono text-cyan-200 uppercase tracking-wider">
                    {slide.source}
                  </span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <div className="text-sm text-cyan-100 font-light">{slide.title}</div>
                  {slide.credit && (
                    <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                      © {slide.credit}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="relative rounded-md border border-cyan-400/10 bg-gradient-to-br from-cyan-900/10 via-transparent to-fuchsia-900/10 p-5">
                <div className="absolute top-2 left-2">
                  <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] font-mono text-cyan-200 uppercase tracking-wider">
                    {slide.source}
                  </span>
                </div>
                <div className="mt-6 text-lg text-cyan-100 font-light italic">
                  {slide.title}
                </div>
              </div>
            )}

            {slide.body && (
              <div className="text-xs text-neutral-400 leading-relaxed">
                <p className={expanded ? "" : "line-clamp-3"}>{slide.body}</p>
                {slide.body.length > 180 && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-1 text-[10px] text-cyan-400/70 hover:text-cyan-300 uppercase tracking-wider"
                  >
                    {expanded ? "Skjul" : "Læs mere"}
                  </button>
                )}
                {slide.link && (
                  <a
                    href={slide.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-3 text-[10px] text-cyan-400/70 hover:text-cyan-300 uppercase tracking-wider"
                  >
                    Kilde ↗
                  </a>
                )}
              </div>
            )}

            {/* Progress-dots */}
            {slides.length > 1 && (
              <div className="flex items-center gap-1 justify-center pt-1">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setFading(true);
                      setTimeout(() => {
                        setIdx(i);
                        setExpanded(false);
                        setFading(false);
                      }, 200);
                    }}
                    className={`h-1 rounded-full transition-all ${
                      i === idx
                        ? "w-6 bg-cyan-400"
                        : "w-1.5 bg-cyan-400/25 hover:bg-cyan-400/50"
                    }`}
                    title={`Gå til slide ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-xs text-neutral-500">
            {data?.error ?? "Indlæser…"}
          </div>
        )}
      </div>
    </Card>
  );
}
