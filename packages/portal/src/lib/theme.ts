// Theme-system: CSS-variabler (--j-acc, --j-acc-r/g/b) + data-theme på <html>.
// Eksisterende text-cyan-* / border-cyan-* klasser overrides via CSS i globals.css.

export type ThemeMode = "single" | "multi";

export interface ThemePreset {
  id: string;
  label: string;
  hex: string;
}

export const PRESETS: ThemePreset[] = [
  { id: "blue", label: "Elektrisk blå", hex: "#38bdf8" },
  { id: "cyan", label: "Skynet cyan", hex: "#00d9ff" },
  { id: "emerald", label: "Grøn", hex: "#10b981" },
  { id: "neon", label: "Neon gul", hex: "#e8ff00" },
  { id: "violet", label: "Violet", hex: "#a78bfa" },
  { id: "fuchsia", label: "Fuchsia", hex: "#e879f9" },
  { id: "amber", label: "Amber", hex: "#fbbf24" },
  { id: "rose", label: "Rose", hex: "#fb7185" },
];

export interface ThemeConfig {
  mode: ThemeMode;
  accent: string; // hex
}

export const DEFAULT_THEME: ThemeConfig = {
  mode: "single",
  accent: "#38bdf8",
};

const STORAGE_KEY = "skynet.theme.v1";

export function loadTheme(): ThemeConfig {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemeConfig>;
    return {
      mode: parsed.mode === "multi" ? "multi" : "single",
      accent: typeof parsed.accent === "string" ? parsed.accent : DEFAULT_THEME.accent,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(cfg: ThemeConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore quota errors
  }
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return { r: 56, g: 189, b: 248 };
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/**
 * Apply theme to <html> element by setting data-theme-mode (single|multi)
 * and CSS variables --j-acc, --j-acc-rgb.
 */
export function applyTheme(cfg: ThemeConfig, el?: HTMLElement): void {
  const target = el ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!target) return;
  const { r, g, b } = hexToRgb(cfg.accent);
  target.setAttribute("data-theme-mode", cfg.mode);
  target.style.setProperty("--j-acc", cfg.accent);
  target.style.setProperty("--j-acc-rgb", `${r}, ${g}, ${b}`);
}
