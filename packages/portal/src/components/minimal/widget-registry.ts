// ──────────────────────────────────────────────────────────────────────────
// Widget registry: add a new widget by registering it here.
// Each entry declares grid placement and a component to render.
// ──────────────────────────────────────────────────────────────────────────
import type { ComponentType } from "react";

export interface WidgetSpec {
  /** Unique id used for toggling/reordering later. */
  id: string;
  /** Section/group label (hero, system, services, ambient...). */
  group: "hero" | "claude" | "system" | "services" | "ambient" | "custom";
  /** 12-col grid column span on desktop. */
  colSpan: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  /** Optional grid row (auto if omitted). */
  rowSpan?: number;
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
