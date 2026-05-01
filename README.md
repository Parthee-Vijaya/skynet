# Skynet

**Personlig AI-platform til macOS** — live cockpit-dashboard, iMessage-assistent med 33 tools, automation-motor og embedded multi-agent orchestrator. Kører lokalt (LM Studio) eller mod cloud (Google Gemini), efter dit valg.

```bash
curl -fsSL https://raw.githubusercontent.com/Parthee-Vijaya/skynet/main/scripts/install.sh | bash
```

Idempotent installer: Homebrew, Node 20+, klon af repo, build af alle pakker, LaunchAgents til auto-start ved login. Kør igen for at opdatere.

---

## Skærmbilleder

### Cockpit · `/minimal`

![Skynet cockpit](docs/screenshots/dashboard.png)

Starquake-minimal-stil i `#0a0a0a` med JetBrains Mono og dashed borders. Live data fra ~20 collectors: vejr, energi, system-telemetri, GitHub trending, Plex, SABnzbd, paseo-agents, månefase, fly i radius, jordskælv, nordlys-chance, plus en animeret Three.js-globus med roterende citater og live ur.

### Telegram bot — primær 2-vejs

Send din egen bot (@dit-bot på Telegram) en besked — den slår op via 33+ tools, svarer tilbage, og kan oprette one-off påmindelser.

```
Mig:    Hvornår kører næste tog fra Næstved til Hellerup?
Skynet: IC42 spor 4 kl. 15:32, ankomst Hellerup 16:48 (1t 16m).

Mig:    Send mig en besked 15 min før det kører.
Skynet: Påmindelse oprettet — sender Telegram kl. 15:17:
        "Toget mod Hellerup kører om 15 min — IC42 spor 4".
```

**Hvorfor Telegram frem for iMessage**: bot har sin egen identitet (@dit-bot), allowlist på chat_id (sikker default: tom = ignorer alt), ingen iCloud-sync-loops, ingen FDA-krav. iMessage-stack er stadig tilgængelig som secondary hvis du vil bruge den.

LLM tvinges til at kalde et tool på første turn (`tool_choice: "required"`) — ingen flere generiske "hej, hvad kan jeg hjælpe med?"-svar uden data.

### Reply tilbage til Claude Code fra iPhone

Stop-hooket sender rige notifikationer når en Claude Code-session er færdig:

```
✅ Claude Code færdig · Skynet
68 msg · 8m 12s
Tools: Read, Edit, Bash, Write, Grep…
Du: "Tilføj Telegram bot"
Claude: "Done — Telegram bot fuldt funktionel med…"
[→ Fortsæt]  [📜 Transcript]
```

Tap "Fortsæt" → åbner `/continue/<sessionId>` PWA-form på iPhone → skriv reply → spawner `claude --resume <id> -p "<prompt>"` på Mac → ny push når Claude er færdig. **Iterativt loop fra iPhone uden at åbne Mac.**

Eller svar direkte i Telegram — `continue_claude_session`-tool routes svaret til samme flow.

### Automations · `/automations`

Tre tabs: regler / setup / logs. NL→automation-genererer regler fra fri tekst ("send push når disken er over 90%"). 9 indbyggede skabeloner. Run-historik drawer pr. regel + dry-run-knap der viser hvad der ville være sendt uden faktisk at sende.

---

## Highlight-features

| | |
|---|---|
| 💬 **Telegram bot 2-vejs** | Indkommende beskeder → LLM med 33+ tools → svar tilbage. Allowlist på chat_id, anti-loop-guard, in-flight-semaphore. iMessage-stack stadig tilgængelig som secondary. |
| 🔁 **Reply tilbage til Claude Code** | Rige Stop-hook-notifikationer (sidste user/assistant + tools + varighed). Tap → `/continue/<id>` PWA-form → spawner `claude --resume`. Eller svar i Telegram/ntfy → samme flow via `continue_claude_session`-tool. |
| 🤖 **Multi-provider LLM** | LM Studio (lokal, GGUF/MLX) eller Google Gemini (cloud, OpenAI-kompatibel mode). Provider-preset i Settings — skift med ét klik. |
| 🧠 **Forced tool-use** | LLM SKAL kalde et tool på første turn (`tool_choice: "required"`) → svaret er altid baseret på reel realtids-data, aldrig training-data-gæt. |
| 📊 **Live JSONL plan-usage** | 5h og 7d rullende vinduer beregnet direkte fra `~/.claude/projects/*.jsonl` — altid friskt, ingen "stale data"-warnings. |
| ⚙️ **Automation-motor** | Cron, threshold, once og manual triggers. Multi-step action-kæder. NL→regel-generator. Run-historik drawer + dry-run pr. regel. |
| 📊 **Live dashboard** | ~20 widgets · 50+ datakilder · Three.js-globus, sparklines, GitHub trending, Plex, paseo-agents, vejr, energi, fly, jordskælv. |
| 🤝 **Paseo agents** | Embedded multi-agent orchestrator (Claude Code/Codex/OpenCode/Pi) på `/agents`. Egen daemon på :6868. |
| 📱 **PWA + Siri** | iPhone-installerbar via Safari "Føj til hjemmeskærm". Apple Shortcut → "Hey Siri, spørg Skynet ..." via `/api/siri?q=...`. |
| 🔔 **Multi-backend push** | macOS Notification Center, ntfy.sh (med reply-back via subscriber), Pushover, Telegram. Per-action-fejl logges separat. |

---

## 33 tools til LLM

Brugeren stiller et spørgsmål → LLM vælger automatisk det mest specifikke tool fra denne tabel. Falder kun tilbage til `web_search` hvis intet andet passer.

### Information & data

| Tool | Kilde | Bruges til |
|---|---|---|
| `read_weather` | Open-Meteo | Vejret nu (temp, vind, fugt) |
| `get_forecast` | Open-Meteo | 7-dages udsigt (max/min, nedbør, UV) |
| `get_weather_warnings` | MeteoAlarm.org | DMI-varsler (storm/sne/glat vej/oversvømmelse) |
| `read_air_quality` | Open-Meteo | AQI, PM2.5, UV, pollen (birk/græs/bynke/oliven) |
| `read_energy` | Energi Data Service | El-spotpris (DK1/DK2) |
| `read_traffic` | Vejdirektoratet | Aktuelle hændelser på danske veje |
| `read_markets` | Yahoo + ECB | Guld/sølv/Brent + EUR/USD/SEK/NOK→DKK |
| `read_flights` | OpenSky Network | Fly i 50km radius |
| `read_moon` | SunCalc | Månefase + næste fuldmåne/nymåne |
| `lookup_address` | DAWA | Danske adresser (vej, postnr, koordinater) |

### Nyheder & web

| Tool | Kilde | Bruges til |
|---|---|---|
| `get_news` | DR/Politiken/TV2/Berlingske + BBC/Reuters/AlJazeera/Guardian | Aggregeret nyheds-feed (`scope: dk\|world\|both`) |
| `fetch_news` | RSS | Specifik feed-URL |
| `reddit_search` | reddit.com/search.json | Subreddit-top eller fri søgning |
| `wikipedia_summary` | Wikipedia REST | Fakta/biografi (DA → EN fallback) |
| `web_search` | DuckDuckGo HTML SERP | Generel web-søgning (8 resultater) |
| `web_fetch` | direkte HTTP | Hent + parse en specifik URL |

### Transport

| Tool | Kilde | Bruges til |
|---|---|---|
| `find_train_route` | Rejseplanen API | Tog/bus/metro Danmark (afgang, spor, varighed). Kræver gratis access ID. |

### Underholdning

| Tool | Kilde | Bruges til |
|---|---|---|
| `search_nzbgeek` | NZBgeek (Newznab) | Trending film + søgning. Kræver API-key. |
| `search_recipes` | TheMealDB | Opskrifter (engelsk database) |

### macOS-integration

| Tool | Bruges til |
|---|---|
| `read_system_status` | CPU, RAM, disk, temperatur |
| `read_disk`, `read_file`, `list_files` | Disk- og filsystem |
| `list_services`, `control_service` | LaunchAgents (start/stop) |
| `list_apps`, `control_app` | macOS-apps (open/quit) |
| `list_calendar_events` | Apple Calendar (i dag + næste 7 dage) |
| `list_reminders`, `add_reminder`, `complete_reminder` | Apple Reminders |
| `send_imessage` | Send iMessage via Messages.app |
| `schedule_imessage_reminder` | Opret one-off iMessage-reminder (auto-sletter efter kørsel) |
| `run_discovery` | Auto-detect nye services/apps |

---

## Providers

### LM Studio (lokal)

Default. Kør GGUF eller MLX-modeller lokalt på din Mac. Ingen netværk, ingen API-omkostninger, intet data forlader maskinen.

```
base url:    http://localhost:1234/v1
api-nøgle:   (vilkårlig værdi — LM Studio ignorerer)
modeller:    Mistral Small 3.2, Munin-7b, gpt-oss-20b … hvad du nu har loaded
```

### Google Gemini (cloud)

Klik **`Google Gemini`** under `/settings` → "llm / provider" → indsæt din nøgle.

```
base url:       https://generativelanguage.googleapis.com/v1beta/openai/
api-nøgle:      gratis fra aistudio.google.com/apikey
default model:  gemini-2.5-flash (hurtig) eller gemini-2.5-pro (kraftigst)
```

Bruger Geminis OpenAI-kompatible endpoint, så al eksisterende Skynet-kode (chat/completions, Bearer auth, tool-format) virker direkte.

### Custom

Enhver OpenAI-kompatibel base URL virker — Anthropic claude, OpenRouter, vLLM osv. Sæt baseUrl + api-nøgle + model-id manuelt.

---

## Telegram-assistent (anbefalet)

Aktivér i `/automations` → setup-tab → "telegram bot". Setup på 5 trin:

1. **Lav botten**: åbn [@BotFather](https://t.me/BotFather) i Telegram → `/newbot` → giv navn + `_bot`-suffix → kopiér token (`123456789:ABCdef...`)
2. **Indsæt token** i Skynet — verificering via `getMe` viser `@dit-bot · navn`-grøn boks
3. **Find chat_id** med "→ find chat_id automatisk"-knappen (kalder `/api/telegram/discover-chats` der parser nye beskeder via `getUpdates`)
4. **Tilføj chat_id** til allowlisten — sikker default: tom = ignorer alt
5. **Toggle "aktivér Telegram-poller"** → long-polling starter med det samme

Skriv en besked til botten — svar inden for 1-2 sek.

### ntfy reply-back

Alternativ til Telegram: ntfy-app understøtter også 2-vejs. Aktivér "ntfy reply-back" under setup-tabbens notify-sektion. Skynet abonnerer på samme topic via SSE-stream, filtrerer botens egne beskeder via `skynet-bot`-tag, og forwarder bruger-replies til `claude --resume` på sidste afsluttede session.

### iMessage-assistent (secondary)

Stadig tilgængelig hvis du vil bruge den, men ikke aktiveret som default længere — Telegram er primær. iMessage-stack:

- **iMessage default-modtager** + **Full Disk Access** til `/opt/homebrew/bin/node`
- Polleren læser `~/Library/Messages/chat.db` hvert 30. sek
- Anti-loop-guard: echo-tracker (10 min) + in-flight semaphore pr. nummer
- **Privacy-bemærkning**: iMessage-flowet svarer på beskeder fra ALLE afsendere — sikre at du virkelig ikke kan klare dig med Telegram før du aktiverer det

### Apple Shortcut alternativ

Hvis du ikke vil give Full Disk Access og ikke vil bruge Telegram:

1. Opret iOS Shortcut: "When I receive a message" → "Get URL" → `https://<din-mac>:3100/api/imessage/inbound`
2. Method POST, body `{ "from": "+45...", "message": <message text> }`
3. Header `Authorization: Bearer <control_token>` (find i `/automations` setup)

---

## Automations

### Triggers

| Type | Eksempel | Bruges til |
|---|---|---|
| `cron` | `0 7 * * *` | Tidspunkts-baseret. Live-feedback i editor (cronstrue + cron-parser) viser dansk beskrivelse + næste 3 udløb. |
| `threshold` | `disk_percent > 90` | Metrik-baseret med cooldown og sustain. Auto-evalueres mod alle collectors. |
| `once` | `runAt: 2026-04-30T15:17:00` | One-off tidspunkt. Auto-sletter efter kørsel. Bruges af `schedule_imessage_reminder`. |
| `manual` | (klik "kør") | Kun manuelt. Bruges til testing. |

### Actions

Multi-step kæder — actions køres sekventielt, stopper ved første fejl.

| Type | Funktion |
|---|---|
| `notify` | Push via aktive backends (macOS, ntfy, pushover). Per-backend-fejl logges separat. |
| `llm_notify` | LLM med tool-calling genererer en besked → push og/eller iMessage. Returnerer `NONE` hvis den ikke har noget værdigt at pinge om — hindrer spam. |
| `tool` | Direkte kald af et af de 33 tools. Destruktive actions (stop/restart/quit) kræver explicit `allowDestructive: true`. |

### NL → automation

Skriv på dansk hvad du vil have:

> "Send push når disken er over 90%"

→ LLM genererer en regel med threshold-trigger og notify-action → editor åbnes prefilled → du bekræfter eller redigerer før gem.

### Run-historik + dry-run

Klik på en regels navn i listen → side-drawer med sidste 25 kørsler (tid, status, message) + en "🧪 test (dry-run)"-knap der kører action-kæden men markerer notify/iMessage som "ville have sendt: ..." uden faktisk at sende.

---

## Tools der kræver API-nøgler

Alle gratis. Sættes under `/automations` → setup-tab.

| Tool | Hvor får jeg nøglen | Hvad det giver |
|---|---|---|
| `find_train_route` | [help.rejseplanen.dk](https://help.rejseplanen.dk) (svar typisk indenfor en uge) | Rigtige togtider — uden den falder LLM tilbage til web_search og kan ikke garantere præcision |
| `search_nzbgeek` | Din `r=`-værdi fra nzbgeek.info-konto | Trending film + Newznab-søgning |
| Gemini API | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (gratis tier) | Cloud-LLM med generøs free quota |

Nøgler gemmes i `packages/portal/data/skynet.db` (SQLite, gitignored). Aldrig i kildekoden, aldrig i git, aldrig i logs.

---

## Sider

| Path | Funktion |
|---|---|
| `/` → `/minimal` | Cockpit-dashboard |
| `/automations` | Regel-motor (3 tabs: regler/setup/logs) |
| `/agents` | Embedded Paseo multi-agent orchestrator |
| `/chat` | LM Studio chat med tool-calling |
| `/terminal` | xterm.js til tmux via WebSocket |
| `/settings` | Profil + LLM-provider + GitHub PAT |
| `/setup` | First-run wizard med auto-discovery |
| `/api/siri?q=...` | Plain-text endpoint for Apple Shortcuts |
| `/api/imessage/inbound` | Inbound iMessage handler (token-auth) |

---

## Arkitektur

```
skynet/
├── packages/
│   ├── portal/         Next.js 16 app router (port 3100)
│   │   ├── src/app/    Sider + ~50 API-routes
│   │   ├── src/lib/
│   │   │   ├── collectors/      ~20 data-kilder (vejr, system, github…)
│   │   │   ├── agent/           tools.ts, dispatcher.ts, actions.ts
│   │   │   ├── integrations/    rejseplanen, nzbgeek, info-tools
│   │   │   └── settings.ts      SQLite-backed config
│   │   ├── src/jobs/   Scheduler, imessage-poller, sparkline-collector
│   │   └── data/       SQLite-database (gitignored)
│   ├── daemon/         Agent-daemon (port 6767, WebSocket-protokol)
│   ├── relay/          WebSocket relay til cross-device
│   ├── highlight/      Syntax-highlighter
│   ├── cli/            `skynet` CLI
│   └── hud/            Native macOS menu-bar (Swift + Porcupine wake-word)
├── scripts/
│   ├── install.sh      One-command installer (idempotent)
│   ├── bootstrap-pocket-agents.sh  tmux + brrr + zshrc-patch
│   └── snap.mjs        Playwright screenshot-capture m. PII-masking
└── docs/
    └── screenshots/    README-screenshots
```

### Services

| Service | Port | LaunchAgent | Beskrivelse |
|---|---|---|---|
| Portal | 3100 (+ 3101 WS) | `com.skynet.portal` | Web-dashboard, API, scheduler, iMessage-poller |
| Daemon | 6767 | `com.skynet.daemon` | Agent-livscyklus |
| Paseo daemon | 6868 | `com.paseo.daemon` | Multi-agent orchestrator |
| HUD | — | (manuel) | macOS menu-bar app |

---

## Development

```bash
npm install              # alle workspace-deps
npm run dev              # portal + daemon parallelt
npm run dev:portal       # kun portal (http://localhost:3100)
npm run dev:daemon       # kun daemon (ws://localhost:6767)
npm run build:daemon     # build daemon + relay + highlight + cli
npm run typecheck        # alle pakker

# Genstart efter build
launchctl kickstart -k gui/$(id -u)/com.skynet.portal
launchctl kickstart -k gui/$(id -u)/com.skynet.daemon

# Logs
tail -f ~/Library/Logs/skynet.err.log
tail -f ~/Library/Logs/skynet-daemon.err.log
```

### Tilføj en widget

```ts
// packages/portal/src/components/minimal/widgets/MinWidget.tsx
export function MinWidget() { return <Section title="…">{/* … */}</Section>; }

// packages/portal/src/components/minimal/widgets/index.ts
registerWidget({ id: "min", group: "system", colSpan: 4, Component: MinWidget });
```

### Tilføj et tool

1. **Schema** i `src/lib/agent/tools.ts` (OpenAI function-format)
2. **Handler** i `src/lib/agent/dispatcher.ts` — `case "min_tool": return await ...`
3. **Tilgængeligt automatisk** i alle LLM-loops (inbound, siri, llm_notify) og som `ToolAction`-target i automations

### Tilføj en collector

1. **Implementér** `src/lib/collectors/min.ts` med `export async function collect(): Promise<MinData>`
2. **Type** i `src/lib/types.ts`
3. **API-route** i `src/app/api/min/route.ts` (1-2 linjer wrapper)
4. **Widget** der bruger `usePoll<MinData>("/api/min", 30000)`

---

## Krav

- macOS 13+ (Ventura eller nyere)
- Node 20+
- Valgfri:
  - **LM Studio** — for lokal LLM (download fra lmstudio.ai)
  - **Gemini API-key** — for cloud-LLM (gratis tier på aistudio.google.com/apikey)
  - **ntfy-app** — for push til iPhone/Android uden Apple Developer-konto
  - **Tailscale** — for at tilgå Skynet fra iPhone udenfor hjemme-WiFi

---

## Sikkerhedsmodel

- **Same-origin auto-allow**: requests fra browseren på localhost tillades uden token
- **Bearer token**: `control_token` (auto-genereret, roterbar) til alle eksterne kald — herunder `/api/imessage/inbound` og chat.db-polleren
- **Destruktive actions**: `control_service stop/restart`, `control_app quit` kræver eksplicit confirmation
- **Session-navne valideres** mod `[a-zA-Z0-9_-]{1,64}` for at undgå shell-injection
- **API-nøgler** lever kun i lokal SQLite-DB, gitignored, aldrig i kildekode eller logs
- **Screenshot-redaktion**: `snap.mjs` masker PII (navne, e-mails, tokens) automatisk inden upload

---

## License

Privat / personligt brug. Ingen distribution uden tilladelse.
