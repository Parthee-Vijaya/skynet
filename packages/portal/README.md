# J.A.R.V.I.S.

Personal intelligence dashboard til macOS. Samler system-telemetri, vejr, fly, jordskælv,
markeder, nyheder, chat med lokal LLM, og mission control over services/apps — alt sammen
på `http://localhost:3100`.

> **Just A Rather Very Intelligent System**

![stack](https://img.shields.io/badge/stack-Next.js%2016%20%C2%B7%20React%2019%20%C2%B7%20Tailwind%204-22d3ee)
![runtime](https://img.shields.io/badge/runtime-Node%2020%2B-green)
![target](https://img.shields.io/badge/target-macOS%20only-000)

---

## Kvik-start (ny Mac)

```bash
curl -fsSL https://raw.githubusercontent.com/Parthee-Vijaya/commandcenter/main/scripts/install.sh | bash
```

Det er det. Scriptet:

1. Installerer Homebrew hvis det mangler
2. Installerer Node 20+ og git hvis de mangler
3. Kloner repo'et til `~/jarvis`
4. Kører `npm install && npm run build`
5. Installerer LaunchAgent så JARVIS starter automatisk ved login
6. Starter serveren på port 3100
7. Åbner **setup-wizarden** (`/setup`) i din browser som viser hvilke datakilder der er klar
   og hvad der evt. kræver en API-nøgle

Installationen er idempotent — du kan køre scriptet igen efter et `git pull` for at genbygge
og genstarte.

---

## Hvad virker out-of-box?

Når serveren kører, virker følgende widgets **uden konfiguration**:

| Widget | Kilde | Kræver |
|---|---|---|
| CPU, Memory, Disk, Status | `systeminformation` | Node (lokalt) |
| Weather | Open-Meteo (gratis API) | Internet |
| Air quality | Open-Meteo AQ | Internet |
| Energy (DK spot-pris) | Elprisen API | Internet |
| Flights | OpenSky | Internet |
| Traffic | Vejdirektoratet | Internet |
| Earthquakes | USGS | Internet |
| Lightning | Blitzortung | Internet |
| Markets | Yahoo Finance proxy | Internet |
| News | RSS feeds | Internet |
| APOD (NASA) | api.nasa.gov | Internet (DEMO_KEY) |
| Devices | `networksetup`, `arp` | macOS |
| Mission control | `launchctl`, `osascript` | macOS |
| Filbrowser (/control) | lokal FS | macOS |

Hvad der **kræver setup**:

| Widget / feature | Setting key | Hvordan |
|---|---|---|
| Chat (`/chat`) | `llm_base_url` | Installer [LM Studio](https://lmstudio.ai), load modeller, start Local Server på port 1234 |
| Plex | `plex_token`, `plex_url` | Find dit token på [plex.tv/claim](https://www.plex.tv/claim) → settings |
| NZBGeek | `nzbgeek_rss_url` | Hent personlig RSS URL fra [nzbgeek.info](https://nzbgeek.info) → settings |
| Lokation (mere præcis) | `location` | `/settings` — sæt lat/lng/label |

Alle settings kan sættes via `/settings` i UI'et.

---

## Systemkrav

- macOS 13+ (testet på macOS 15 Sequoia & 26 / "Taho")
- Apple Silicon (M-series) anbefalet — også fungerer på Intel
- Minimum 4 GB ledig RAM
- Til chat: mindst 16 GB RAM hvis du vil køre 20B-modeller via LM Studio

---

## Manuel installation (hvis du ikke vil køre install.sh)

### Forudsætninger
```bash
# Homebrew (hvis ikke installeret)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node 20+ og git
brew install node@20 git
brew link --overwrite --force node@20
```

### Klon og byg
```bash
git clone https://github.com/Parthee-Vijaya/commandcenter.git ~/jarvis
cd ~/jarvis
npm install
npm run build
```

### Test dev-serveren
```bash
npm run dev
# → http://localhost:3100
```

### Installer som LaunchAgent (autostart ved login)
```bash
# Generer plist med dine stier
NPM_PATH="$(command -v npm)"
sed \
  -e "s|__JARVIS_HOME__|$HOME/jarvis|g" \
  -e "s|__NPM_PATH__|$NPM_PATH|g" \
  -e "s|__NODE_DIR__|$(dirname $NPM_PATH)|g" \
  -e "s|__USER_HOME__|$HOME|g" \
  scripts/com.jarvis.dashboard.template.plist \
  > ~/Library/LaunchAgents/com.jarvis.dashboard.plist

# Bootstrap i bruger-domain
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jarvis.dashboard.plist
```

---

## Daglig brug

| Handling | Kommando |
|---|---|
| Åbn dashboard | [http://localhost:3100](http://localhost:3100) |
| Åbn chat | [http://localhost:3100/chat](http://localhost:3100/chat) |
| Åbn filbrowser | [http://localhost:3100/control](http://localhost:3100/control) |
| Åbn settings | [http://localhost:3100/settings](http://localhost:3100/settings) |
| Åbn setup-wizard | [http://localhost:3100/setup](http://localhost:3100/setup) |
| Genstart server | `launchctl kickstart -k gui/$(id -u)/com.jarvis.dashboard` |
| Stop server | `launchctl bootout gui/$(id -u)/com.jarvis.dashboard` |
| Start server | `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jarvis.dashboard.plist` |
| Se logs | `tail -f ~/Library/Logs/jarvis.err.log` |
| Opdater | `cd ~/jarvis && git pull && npm install && npm run build && launchctl kickstart -k gui/$(id -u)/com.jarvis.dashboard` |

---

## Mission Control

Widgetten på dashboardet + `/control`-siden lader dig styre services og apps.

- **Services**: `launchctl` bootstrap / bootout / kickstart via whitelisted `com.*` labels
- **Apps**: `open -a` launch, AppleScript quit — whitelisted app-navne i `/Applications`
- **Filbrowser**: Read-only browse af whitelistede roots (`~/Desktop/Claude/projekter`, `~/Downloads`, `~/Documents`, `~/Desktop`, `~/Library/Logs`)

Whitelistet i `src/lib/control/allowlist.ts`. Override via setting-key `control_allowlist` (samme JSON-struktur).

Sikkerhed:
- **Same-origin** requests (browser på localhost) tillades automatisk
- **Cross-origin** kræver `Authorization: Bearer <token>` — token auto-genereres, kan roteres via `POST /api/control/token`
- Stop/restart/quit kræver også `X-Confirm: true`-header
- Path-traversal blokeres i filbrowseren

---

## Valgfri env-vars

Sæt i shell-profil (`~/.zshrc`) eller pass via plist:

```bash
export NASA_API_KEY="din-nøgle-fra-api.nasa.gov"  # Fjerner DEMO_KEY rate-limit
export GITHUB_USER="dit-github-brugernavn"         # Default: Parthee-Vijaya
```

Hvis du vil sætte dem via LaunchAgent, tilføj til `<key>EnvironmentVariables</key>` i plisten
og kør `launchctl kickstart -k ...`.

---

## Arkitektur

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Dashboard (widgets grid)
│   ├── chat/page.tsx       # Open WebUI-stil lokal chat
│   ├── control/page.tsx    # Filbrowser
│   ├── setup/page.tsx      # First-run discovery wizard
│   ├── settings/page.tsx   # LLM + lokation + API keys
│   └── api/
│       ├── [widget-endpoints]/     # ~25 collectors
│       ├── chat/                   # streamText via LM Studio
│       ├── settings/               # key-value CRUD
│       └── control/
│           ├── services/           # launchctl styring
│           ├── apps/               # open/osascript styring
│           ├── files/              # read-only filbrowser
│           ├── discover/           # auto-detection
│           └── token/              # Bearer token CRUD
├── components/
│   ├── Dashboard.tsx
│   ├── widgets/            # CpuWidget, WeatherWidget, ControlWidget, …
│   └── ui/Card.tsx
└── lib/
    ├── db.ts               # better-sqlite3 (data/jarvis.db)
    ├── settings.ts         # getSetting / setSetting / getSettingJSON
    ├── collectors/         # weather.ts, plex.ts, etc. — pure fetchers
    └── control/
        ├── allowlist.ts    # hvad må styres
        ├── auth.ts         # same-origin + bearer token
        ├── services.ts     # launchctl wrapper
        ├── apps.ts         # osascript + open
        └── files.ts        # path-safe filbrowser
```

Data persisteres i `data/jarvis.db` (SQLite) og `localStorage` (chat-historik i browseren).

---

## Fejlfinding

**Serveren starter ikke ved login**
```bash
# Tjek om den er loaded
launchctl print gui/$(id -u)/com.jarvis.dashboard | head -30

# Tjek error-log
tail -50 ~/Library/Logs/jarvis.err.log
```

**Port 3100 er optaget**
```bash
# Find hvad der har porten
lsof -iTCP:3100 -sTCP:LISTEN

# Enten dræb den anden proces, eller skift port i package.json + plist
```

**`command not found` efter brew install**
```bash
# Tilføj brew til PATH
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
source ~/.zshrc
```

**Mission control viser intet**
- Tjek at serveren kører (→ `curl http://localhost:3100/api/system`)
- Tjek browserkonsol for 401 — betyder same-origin-check fejler (tjek at du er på `localhost:3100`, ikke `127.0.0.1`)
- Tjek `/api/control/services` direkte

**Chat viser "LM Studio ikke tilgængelig"**
- Start LM Studio, gå til "Developer"-fanen, tryk **Start Server** (port 1234)
- Load mindst én model i "My Models"
- Genopfrisk `/chat`

---

## Licens

Personligt projekt — ingen licens. Brug efter eget ansvar.

---

## Bidrag / issues

GitHub: [Parthee-Vijaya/commandcenter](https://github.com/Parthee-Vijaya/commandcenter)
