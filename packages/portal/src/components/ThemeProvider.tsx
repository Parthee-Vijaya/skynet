"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { applyTheme, loadTheme, saveTheme, DEFAULT_THEME, type ThemeConfig } from "@/lib/theme";

interface Ctx {
  theme: ThemeConfig;
  setTheme: (cfg: ThemeConfig) => void;
  resetTheme: () => void;
}

const ThemeCtx = createContext<Ctx | null>(null);

export function useTheme(): Ctx {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme uden ThemeProvider");
  return v;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeConfig>(DEFAULT_THEME);
  const [hydrated, setHydrated] = useState(false);

  // Indlæs fra localStorage på client
  useEffect(() => {
    const t = loadTheme();
    setThemeState(t);
    applyTheme(t);
    setHydrated(true);
  }, []);

  // Anvend CSS-vars ved ændring
  useEffect(() => {
    if (!hydrated) return;
    applyTheme(theme);
  }, [theme, hydrated]);

  const setTheme = (cfg: ThemeConfig) => {
    setThemeState(cfg);
    saveTheme(cfg);
  };

  const resetTheme = () => setTheme(DEFAULT_THEME);

  return <ThemeCtx.Provider value={{ theme, setTheme, resetTheme }}>{children}</ThemeCtx.Provider>;
}
