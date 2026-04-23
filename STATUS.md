# Skynet — Implementeringsstatus

## Kilde-repos (klonet til /tmp/)
- `/tmp/jarvishud-explore` — https://github.com/Parthee-Vijaya/JarvisHUD
- `/tmp/paseo-explore` — https://github.com/getpaseo/paseo
- `/tmp/commandcenter-explore` — https://github.com/Parthee-Vijaya/commandcenter

## Fase 1: Scaffold monorepo + flyt filer — FÆRDIG
- [x] Alle 6 packages kopieret (portal, daemon, relay, highlight, cli, hud)
- [x] Root package.json med npm workspaces
- [x] tsconfig.base.json, biome.json, patches/ kopieret
- [x] scripts/dev.sh + scripts/postinstall-patches.mjs

## Fase 2: Fix kryds-referencer + package names — FÆRDIG
- [x] @getpaseo/* → @skynet/* (daemon, relay, highlight, cli)
- [x] jarvis → @skynet/portal
- [x] CLI binary: bin/paseo → bin/skynet
- [x] Alle import statements opdateret

## Fase 3: Rebranding → Skynet — FÆRDIG
- [x] Portal: J.A.R.V.I.S. → S.K.Y.N.E.T. i layout, display-strings, quotes, prompts
- [x] Portal: jarvis.db → skynet.db (med migration fallback)
- [x] Portal: com.jarvis.dashboard → com.skynet.portal (plist + scripts)
- [x] Portal: install.sh rebranded
- [x] Daemon: ~/.paseo → ~/.skynet, PASEO_* → SKYNET_*, paseo → skynet
- [x] Daemon: shell-integration filer (zsh/bash) rebranded
- [x] CLI: paseo → skynet overalt
- [x] HUD: 101 Swift-filer rebranded, mapper omdøbt (Jarvis/ → Skynet/)
- [x] HUD: pbxproj opdateret, entitlements omdøbt, bundle ID pavi.Skynet

## Fase 4: Agents-sektion — FÆRDIG
- [x] /api/daemon/route.ts — daemon status proxy
- [x] /api/daemon/agents/route.ts — list/create agents via daemon WS
- [x] lib/daemon-config.ts — connection settings
- [x] lib/daemon-client.ts — server-side WS client
- [x] /agents/page.tsx — full agents page (list, create, status)
- [x] AgentsWidget.tsx — dashboard widget
- [x] Navigation: agents link i ControlWidget + ThemeSettings

## Fase 5: Install script — FÆRDIG
- [x] scripts/install.sh — unified installer (brew, node, git, clone, build, 2x LaunchAgent, HUD)
- [x] Daemon LaunchAgent template inline i script
- [x] Health check for begge services
- [x] Valgfri HUD-build hvis Xcode tilgængelig

## Fase 6: Root config — FÆRDIG
- [x] README.md
- [x] .gitignore
- [x] Git repo initialiseret

## Næste skridt (valgfrit)
- [ ] Xcode project rename verification (åbn i Xcode UI for at sikre det bygger)
- [ ] npm install test fra root
- [ ] Portal typecheck
- [ ] Push til GitHub
