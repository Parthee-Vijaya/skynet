import { getSettingJSON, setSettingJSON } from "./settings";
import { DEFAULT_APPS, type AppEntry, type AppOverrides } from "./apps";

/**
 * Server-only: læser apps_overrides fra SQLite og fletter med defaults.
 *
 * Denne fil må kun importeres fra API-routes og server-components.
 * Better-sqlite3-importen via ./settings → ./db sikrer at Next.js
 * bundler ikke kan inkludere den i klient-bundlen.
 */

export function getAppsWithOverrides(): AppEntry[] {
  const overrides = getSettingJSON<AppOverrides>("apps_overrides", {});
  return DEFAULT_APPS.map((app) => {
    const ov = overrides[app.id];
    if (!ov) return app;
    return {
      ...app,
      localUrl: ov.localUrl ?? app.localUrl,
      tailscaleUrl: ov.tailscaleUrl ?? app.tailscaleUrl,
      healthUrl: ov.healthUrl ?? app.healthUrl,
      disabled: ov.disabled ?? app.disabled,
    };
  }).filter((app) => !app.disabled);
}

export function getAppOverrides(): AppOverrides {
  return getSettingJSON<AppOverrides>("apps_overrides", {});
}

export function setAppOverrides(value: AppOverrides): void {
  setSettingJSON("apps_overrides", value);
}

export function getAppById(id: string): AppEntry | undefined {
  return getAppsWithOverrides().find((a) => a.id === id);
}
