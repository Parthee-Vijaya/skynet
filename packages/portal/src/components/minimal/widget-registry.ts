// ──────────────────────────────────────────────────────────────────────────
// Widget registry — bento-style med kategori-grupperede semantiske farver.
//
// Hvert widget specificerer:
//   - cols: 1-4 (4-col bento-grid på desktop, alt stack'er til full-width på mobil)
//   - rows: 1-2 (kun store widgets som hero får rows=2)
//   - category: bestemmer accent-farve (--cat-system, --cat-code, --cat-media, --cat-ambient)
//
// Bagudkompatibilitet: legacy `colSpan: 12` (full-width) håndteres som cols=4.
// ──────────────────────────────────────────────────────────────────────────
import type { ComponentType } from "react";

/** Bento-grid kategori — bestemmer accent-farve via globals.css CSS-vars */
export type WidgetCategory = "system" | "code" | "media" | "ambient" | "hero";

export interface WidgetSpec {
  /** Unique id used for toggling/reordering later. */
  id: string;
  /** Section/group label (hero, system, services, ambient...). */
  group: "hero" | "claude" | "system" | "services" | "ambient" | "custom";
  /** Bento grid-bredde 1-4 (4-col grid på desktop). */
  cols: 1 | 2 | 3 | 4;
  /** Bento grid-højde 1-2. Default 1. */
  rows?: 1 | 2;
  /**
   * Kategori — vælger accent-farve. Hvis undefined falder den tilbage til
   * widget's eget interne farveskema (legacy).
   */
  category?: WidgetCategory;
  /** React component to render (must be "use client"). */
  Component: ComponentType;
  /** If true, component is hidden but kept in registry (feature flag). */
  disabled?: boolean;
}

const registry: WidgetSpec[] = [];

export function registerWidget(spec: WidgetSpec): void {
  const existing = registry.findIndex((w) => w.id === spec.id);
  if (existing >= 0) registry[existing] = spec;
  else registry.push(spec);
}

export function getWidgets(): WidgetSpec[] {
  return registry.filter((w) => !w.disabled);
}

export function getWidgetsByGroup(group: WidgetSpec["group"]): WidgetSpec[] {
  return getWidgets().filter((w) => w.group === group);
}
