# @skynet/portal

Next.js-portalen der driver S.K.Y.N.E.T. — cockpit, chat, automations, agents og settings
på `http://localhost:3100`. Del af monorepo'et [`Parthee-Vijaya/skynet`](https://github.com/Parthee-Vijaya/skynet).

> Se rodens [README](../../README.md) for samlet installation, arkitektur og screenshots.

![stack](https://img.shields.io/badge/stack-Next.js%2016%20%C2%B7%20React%2019%20%C2%B7%20Tailwind%204-22d3ee)
![runtime](https://img.shields.io/badge/runtime-Node%2020%2B-green)
![target](https://img.shields.io/badge/target-macOS%20only-000)

---

## Hvad driver denne pakke?

- `/minimal` — cockpit-dashboard (starquake-stil, widgets)
- `/automations` — cron + tærskel automations, kædede actions, LLM-drevne briefings
- `/agents` — daemon-agent-oversigt
- `/chat` — lokal LM Studio-chat med tool-calling
- `/settings` — profil, lokation, LLM-konfig, service-API-keys
- `/setup` — first-run opsætnings-wizard med auto-discovery

Plus ~35 REST-endpoints under `/api/*` til widgets, tools, Siri og PWA.

---

## Development

Fra rod-mappen i monorepo'et:

```bash
npm install
npm run dev:portal       # starter kun portal → http://localhost:3100
npm run dev              # starter portal + daemon (concurrent)
npm run build --workspace=@skynet/portal
npm run typecheck
```

Eller lokalt i denne pakke:

```bash
cd packages/portal
npm run dev
npm run build
npm run start            # production build på :3100
```

---

## Hvad virker out-of-box?

Når portalen kører, virker følgende widgets **uden konfiguration**:

| Widget | Kilde | Kræver |
|---|---|---|
| CPU, Memory, Disk, Net | `systeminformation` | Node (lokalt) |
| Weather (+ live geolocation) | Open-Meteo | Internet |
| Air quality | Open-Meteo AQ | Internet |
| Energy (DK spot-pris) | Elprisen API | Internet |
| Flights | OpenSky | Internet |
| Earthquakes | USGS | Internet |
| Markets | Yahoo Finance proxy | Internet |
| News | RSS feeds (DR, Politiken…) | Internet |
| GitHub Trending | api.github.com | Internet |
| Claude-code stats | `~/.claude/projects/*.jsonl` | macOS |
| Services & ports | `lsof` | macOS |
| Mission control | `launchctl`, `osascript` | macOS |

### Kræver konfiguration

| Widget / feature | Setting key | Hvordan |
|---|---|---|
| Chat (`/chat`) | `llm_base_url` | Installer [LM Studio](https://lmstudio.ai), load model, start Local Server på port 1234 |
| Plex widget | `plex_token`, `plex_url` | [plex.tv/claim](https://www.plex.tv/claim) → sæt i `/settings` |
| NZBGeek | `nzbgeek_rss_url` | Personlig RSS fra [nzbgeek.info](https://nzbgeek.info) |
| iMessage push | — | macOS → Indstillinger → Privatliv & sikkerhed → Automatisering — giv adgang til Messages.app |
| ntfy push | `ntfy_topic` | `/setup` eller `/automations` → ntfy-feltet |
| Lokation | `location` | `/settings` eller `/setup` (geocodes automatisk) |

---

## Systemkrav

- macOS 13+ (Ventura eller nyere — testet på Sequoia og "Taho")
- Apple Silicon anbefalet · Intel fungerer
- Minimum 4 GB ledig RAM
- Til chat: 16 GB+ RAM hvis du vil køre 20B-modeller via LM Studio

---

## PWA + Siri

`/minimal` kan installeres som PWA på iPhone (Safari → Del → **Føj til hjemmeskærm**).
Service-worker cacher statiske assets og bruger stale-while-revalidate på API-responses
så widgets viser data instant, selv offline.

Siri-endpoint `GET /api/siri?q=...` returnerer plain-text (max 500 tegn) med tool-calling
aktivt — bruges i Apple Shortcuts til "Hey Siri, spørg Skynet …". Se hoved-README for
Shortcut-opsætning.

---

## Mission Control

`/api/control/*` lader dig styre services, apps og filer lokalt:

- **Services**: `launchctl bootstrap/bootout/kickstart` via whitelisted `com.*` labels
- **Apps**: `open -a` launch, AppleScript quit — whitelisted app-navne i `/Applications`
- **Filbrowser**: Read-only browse af whitelistede roots (Desktop, Downloads, Documents, Logs)

Whitelisten er i `src/lib/control/allowlist.ts`. Override via setting-key `control_allowlist`.

### Sikkerhed

- **Same-origin** fra browseren på `localhost:3100` tillades automatisk
- **Cross-origin** kræver `Authorization: Bearer <token>` — auto-genereres, roteres via `POST /api/control/token`
- Stop/restart/quit kræver også `X-Confirm: true`-header
- Path-traversal blokeres i filbrowseren

---

## Valgfri env-vars

Sæt i shell-profil (`~/.zshrc`) eller LaunchAgent-plist:

```bash
export NASA_API_KEY="din-nøgle-fra-api.nasa.gov"   # Fjerner DEMO_KEY rate-limit
export GITHUB_USER="dit-github-brugernavn"          # Default: tom → widget viser intet
```

Hvis du vil sætte dem via LaunchAgent, tilføj til `<key>EnvironmentVariables</key>` i
plisten og kør `launchctl kickstart -k ...`.

---

## Arkitektur

```
src/
├── app/                    # Next.js App Router
│   ├── minimal/page.tsx    # Cockpit (12-col widget-grid)
│   ├── automations/        # Cron + tærskel + kædede actions
│   ├── agents/             # Daemon-agent-oversigt
│   ├── chat/               # LM Studio + tool-calling loop
│   ├── settings/           # Profil + LLM + API-keys
│   ├── setup/              # First-run wizard
│   ├── mockup/             # Design-referencer (A/B/C + mobile)
│   └── api/
│       ├── [widgets]/      # ~25 collectors
│       ├── chat/           # Streaming med tool-calling
│       ├── siri/           # Plain-text endpoint til Apple Shortcuts
│       ├── automations/    # CRUD + notify-config + gmail-config
│       ├── agent/logs/     # SSE-stream af agent-output
│       └── control/        # Services + apps + files + token
├── components/
│   ├── minimal/            # Cockpit primitives + widgets
│   ├── automations/        # Editor + AgentLogPanel
│   ├── ui/Button.tsx       # Tap-friendly knap-primitiv
│   ├── MinimalPageLayout   # Shared layout med MobileNav
│   └── PWARegister         # Service worker registration
├── lib/
│   ├── db.ts               # better-sqlite3 (data/skynet.db)
│   ├── settings.ts         # getSetting / setSetting / profile / location
│   ├── collectors/         # weather.ts, plex.ts, claude.ts, etc.
│   ├── notify/             # macos + ntfy + pushover backends
│   ├── agent/              # tools, dispatcher, actions (kædede), log-buffer
│   └── control/            # allowlist, auth, services, apps, files
└── jobs/
    ├── scheduler.ts        # node-cron + runActions()
    └── meeting-prep.ts     # Pre-meeting briefing job
```

Data persisteres i `data/skynet.db` (SQLite) og `localStorage` (chat-historik).

---

## PWA-assets

I `public/`:

- `manifest.json` — PWA manifest med shortcuts til cockpit/chat/automations
- `sw.js` — Service worker (cache-first statik, SWR API, network-first navigation)
- `icon-192.png`, `icon-512.png` — PWA icons (any-purpose)
- `icon-192-maskable.png`, `icon-512-maskable.png` — Android safe-zone
- `apple-touch-icon.png` — iOS home-screen ikon (180×180)

Genérer nye ikoner med `python3` + Pillow — kildescript er dokumenteret i commit-historien.

---

## Fejlfinding

**Portalen starter ikke ved login**
```bash
launchctl print gui/$(id -u)/com.skynet.portal | head -30
tail -50 ~/Library/Logs/skynet-portal.err.log
```

**Port 3100 er optaget**
```bash
lsof -iTCP:3100 -sTCP:LISTEN
# Dræb eller skift port i package.json + plist
```

**Mission control viser intet**
- Tjek at portalen kører (`curl http://localhost:3100/api/system`)
- Tjek browser-konsol for 401 → same-origin fejler (brug `localhost:3100`, ikke `127.0.0.1`)

**Chat viser "LM Studio ikke tilgængelig"**
- Start LM Studio → Developer-fanen → **Start Server** (port 1234)
- Load mindst én model → genindlæs `/chat`

**PWA-ikon opdateres ikke på iPhone**
- Fjern eksisterende home-screen-genvej (hold inde → Fjern)
- Safari → Avanceret → Webside-data → slet din mac-adresse
- Hard-refresh (⌘⇧R) og tilføj igen

---

## Licens

Privat. Del af Skynet-monorepo'et.
