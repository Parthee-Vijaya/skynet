import { NextResponse } from "next/server";
import { getAppsWithOverrides } from "@/lib/apps.server";

/**
 * Returnerer app-registry med settings-overrides anvendt.
 * Kaldes fra /apps-siden så klienten ser brugerens konfigurerede URL'er
 * (ikke kun DEFAULT_APPS-konstanten).
 */
export async function GET() {
  const apps = getAppsWithOverrides();
  return NextResponse.json({ apps });
}
