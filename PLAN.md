# Skynet — Unified Monorepo Plan

## Context

Tre separate repos (JarvisHUD, CommandCenter, Paseo) skal samles i ét "Skynet" monorepo. Portalen (CommandCenter/Next.js) er hovedinterfacet — tilgængeligt fra mobil/desktop. Paseo's agent-daemon kører som backend-service. Swift-appen er den native macOS companion. Alt installeres med én curl-kommando.

---

## Monorepo-struktur

```
skynet/
├── README.md
├── package.json                  ← npm workspaces root
├── tsconfig.base.json
├── biome.json
├── scripts/
│   ├── install.sh                ← Unified curl | bash installer
│   ├── com.skynet.portal.plist   ← LaunchAgent template (port 3100)
│   ├── com.skynet.daemon.plist   ← LaunchAgent template (port 6767)
│   └── dev.sh                   ← Start begge services i dev
├── packages/
│   ├── portal/                  ← CommandCenter → Skynet Portal (Next.js 16)
│   ├── daemon/                  ← Paseo server → Skynet Daemon (Express + WS)
│   ├── relay/                   ← Paseo relay (beholdes som-is)
│   ├── highlight/               ← Paseo syntax highlighting (beholdes)
│   ├── cli/                     ← Paseo CLI → skynet CLI
│   └── hud/                     ← JarvisHUD → Skynet HUD (Swift/Xcode)
```

**Discarded fra Paseo:** `packages/app` (Expo), `packages/desktop` (Electron), `packages/website`, `expo-two-way-audio`. Erstattes af Portal + HUD.

---

## Fase 1: Scaffold monorepo + flyt filer

1. Opret nyt `skynet` repo med strukturen ovenfor
2. **CommandCenter → `packages/portal/`**: Kopier `src/`, `package.json`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `data/`
3. **Paseo server → `packages/daemon/`**: Kopier `packages/server/` indhold
4. **Paseo relay → `packages/relay/`**: Kopier som-is
5. **Paseo highlight → `packages/highlight/`**: Kopier som-is
6. **Paseo CLI → `packages/cli/`**: Kopier `packages/cli/` indhold
7. **JarvisHUD → `packages/hud/`**: Kopier hele repo (Xcode-projekt, Swift-kode, scripts)
8. Kopier `tsconfig.base.json`, `biome.json`, `patches/` fra Paseo root

---

## Fase 2: Fix kryds-referencer + package names

| Gammelt navn | Nyt navn |
|---|---|
| `@getpaseo/server` | `@skynet/daemon` |
| `@getpaseo/relay` | `@skynet/relay` |
| `@getpaseo/highlight` | `@skynet/highlight` |
| `@getpaseo/cli` | `@skynet/cli` |
| `jarvis` (portal) | `@skynet/portal` |

- Opdater alle `import` statements og `dependencies` i de 5 npm packages
- Align React til 19.2.3 via root `overrides`
- TypeScript til ^5.9.3 overalt
- `@ai-sdk/openai` og `ai` har forskellige major-versioner mellem portal og daemon — npm workspaces isolerer dem automatisk

---

## Fase 3: Rebranding → Skynet

### Portal (Next.js)
- `layout.tsx`: title "J.A.R.V.I.S." → "S.K.Y.N.E.T" / "Skynet"
- `db.ts`: `jarvis.db` → `skynet.db` (med migration: rename hvis jarvis.db eksisterer)
- `Dashboard.tsx`, alle widgets: Jarvis → Skynet i display-strings
- `install.sh` template: `com.jarvis.dashboard` → `com.skynet.portal`
- LaunchAgent label, log-stier, alle env-vars

### Daemon (Express/WS)
- Config dir: `~/.paseo` → `~/.skynet`
- Env vars: `PASEO_LISTEN` → `SKYNET_DAEMON_LISTEN` (med fallback)
- CLI binary: `paseo` → `skynet`
- Log-præfikser, user-facing strings

### HUD (Swift)
- `Constants.swift`: displayName → "S.K.Y.N.E.T", appName → "Skynet"
- Bundle ID: `pavi.Jarvis` → `pavi.Skynet`
- Xcode project rename (gøres manuelt i Xcode UI — `.pbxproj` er skrøbeligt)
- Keychain service identifiers
- URL scheme: `jarvis://` → `skynet://`
- Mappe: `Jarvis/` → `Skynet/`

---

## Fase 4: Agents-sektion i Portalen

**Arkitektur:** Daemon kører separat på port 6767. Portalen forbinder via WebSocket.

### Nye filer i `packages/portal/`:
- `src/app/agents/page.tsx` — Oversigt over aktive agents
- `src/app/agents/[id]/page.tsx` — Detaljevisning med live terminal
- `src/components/agents/AgentList.tsx` — Agent-liste komponent
- `src/components/agents/AgentDetail.tsx` — Terminal + timeline + permissions
- `src/components/agents/AgentCreateDialog.tsx` — Spawn ny agent
- `src/components/agents/TerminalView.tsx` — Terminal-output renderer
- `src/hooks/useDaemonClient.ts` — React hook wrapping DaemonClient
- `src/lib/daemon-config.ts` — Daemon connection settings
- `src/components/widgets/AgentsWidget.tsx` — Dashboard-widget

### Integration:
- Brug `DaemonClient` fra `@skynet/daemon` (WebSocket transport)
- Hvis browser-inkompatibel: opret proxy route `src/app/api/agents/ws/route.ts`
- Portal gracefully handles daemon-offline ("Daemon offline" status)
- Navigation: tilføj "Agents" ved siden af Dashboard, Chat, Control, Settings

### Behold eksisterende Delegate-side:
- `src/app/delegate/page.tsx` forbliver som quick fire-and-forget
- Agents-siden er til fuld lifecycle management

---

## Fase 5: Unified Install Script

Baseret på CommandCenter's eksisterende `install.sh`. Nyt: `scripts/install.sh`

```bash
#!/bin/bash
# curl -fsSL https://raw.githubusercontent.com/<user>/skynet/main/scripts/install.sh | bash
SKYNET_HOME="${SKYNET_HOME:-$HOME/skynet}"
```

### Trin:
1. Installer Homebrew (hvis mangler)
2. Installer Node 20+ og git
3. Klon repo til `~/skynet`
4. `npm install` (root — workspaces håndterer alt)
5. `npm run build:daemon` (portal kan køre i dev mode)
6. Opsæt 2 LaunchAgents:
   - `com.skynet.portal` → port 3100
   - `com.skynet.daemon` → port 6767
7. Valgfrit: byg Swift HUD (hvis Xcode er tilgængelig)
8. Start begge services
9. Vent på health check (port 3100 + 6767)
10. Åbn `http://localhost:3100/setup` i browser

---

## Fase 6: Swift HUD ↔ Portal integration (valgfrit)

- Tilføj settings-felt i HUD: "Skynet Portal URL" (default: `http://localhost:3100`)
- `SkynetPortalService.swift`: Hent data fra portal's API (`/api/weather`, `/api/system`) i stedet for direkte API-kald
- Agent-status indikator i HUD via daemon WebSocket

---

## Risici

1. **Xcode project rename** — `.pbxproj` er skrøbeligt. Brug Xcode UI, ikke scripts
2. **DaemonClient i browser** — importerer `ws` (Node-only). Verificer transport-abstraction eller opret proxy
3. **DB migration** — `jarvis.db` → `skynet.db` kræver rename-logik ved opstart
4. **Env var rename** — tilføj fallback: `SKYNET_* ?? PASEO_* ?? default`
5. **To-process startup** — portal skal håndtere daemon-offline gracefully

---

## Verifikation

1. `npm install` fra root — ingen errors
2. `npm run dev:portal` → http://localhost:3100 viser Skynet dashboard
3. `npm run dev:daemon` → daemon lytter på port 6767
4. Agents-side i portal forbinder til daemon og viser agent-liste
5. `skynet run "hello"` CLI spawner en agent via daemon
6. `curl -fsSL .../install.sh | bash` på en ren Mac installerer alt
7. Swift HUD bygger med `packages/hud/run-dev.sh`
8. Begge LaunchAgents starter automatisk ved login
