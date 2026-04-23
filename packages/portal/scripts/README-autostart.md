# JARVIS — Autostart

Kør JARVIS som altid-tændt baggrundsservice på macOS via `launchd`.

## 1) JARVIS dashboard (LaunchAgent)

LaunchAgent'en starter `npm start` (port 3100) ved login og genstarter
automatisk hvis processen crasher. Bygges én gang med `npm run build`
— og igen ved kode-ændringer.

### Installation

```bash
cd /Users/parthee/Desktop/Claude/projekter/jarvis

# 1) Byg production bundle
npm run build

# 2) Kopier plist til LaunchAgents
cp scripts/com.jarvis.dashboard.plist ~/Library/LaunchAgents/

# 3) Load + start
launchctl load ~/Library/LaunchAgents/com.jarvis.dashboard.plist

# 4) Verificér
launchctl list | grep jarvis
# Forventet output: PID  0  com.jarvis.dashboard
curl -s http://localhost:3100/api/health | head
```

### Hverdagskommandoer

| Opgave | Kommando |
|---|---|
| Status | `launchctl list \| grep jarvis` |
| Stop + unload | `launchctl unload ~/Library/LaunchAgents/com.jarvis.dashboard.plist` |
| Start igen | `launchctl load ~/Library/LaunchAgents/com.jarvis.dashboard.plist` |
| Genstart efter deploy | `launchctl kickstart -k gui/$(id -u)/com.jarvis.dashboard` |
| Live-logs (stdout) | `tail -f ~/Library/Logs/jarvis.out.log` |
| Live-logs (stderr) | `tail -f ~/Library/Logs/jarvis.err.log` |

### Deploy nye kode-ændringer

```bash
cd /Users/parthee/Desktop/Claude/projekter/jarvis
git pull                                                  # eller bare nyt kode-check-in
npm install                                               # hvis package.json har ændringer
npm run build                                             # genbyg production bundle
launchctl kickstart -k gui/$(id -u)/com.jarvis.dashboard  # hot-swap processen
```

## 2) LM Studio (GUI-variant)

Den nemmeste og mest robuste opsætning — LM Studio starter selv med
macOS og auto-loader dine sidst-brugte modeller.

1. Åbn **LM Studio** → klik på **Developer** i venstre sidebjælke
2. Slå **"Start server on app launch"** til (grønt toggle)
3. Slå **"Auto-load previously loaded models"** til
4. Load dine tre modeller én gang manuelt:
   - `munin-7b-alpha` (GGUF Q4_K_M)
   - `mlx-community/Mistral-Small-3.2-24B-Instruct-2506-4bit`
   - `lmstudio-community/gpt-oss-20b-MLX-4bit`
5. Åbn **Systemindstillinger → Generelt → Login-emner** → klik `+` → tilføj
   **LM Studio.app**

Efter næste genstart kører både LM Studio + JARVIS automatisk. Åbn bare
`http://localhost:3100` i browseren når du har brug for det.

### Verificér LM Studio-backend

```bash
curl -s http://localhost:1234/v1/models | python3 -m json.tool
```

Forventet: JSON med `data[]` der indeholder id'er for de loaded modeller.

## 3) Fejlfinding

### JARVIS kører ikke efter login
```bash
# Se stderr for opstartsfejl
tail -50 ~/Library/Logs/jarvis.err.log

# Tjek at plist er valid XML
plutil -lint ~/Library/LaunchAgents/com.jarvis.dashboard.plist

# Tving reload
launchctl unload ~/Library/LaunchAgents/com.jarvis.dashboard.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.jarvis.dashboard.plist
```

### npm-sti forkert
Hvis du bruger asdf/nvm/volta i stedet for Homebrew, ret stien i plistens
`ProgramArguments` til det fulde path. Find det med:
```bash
which npm    # fx /Users/parthee/.volta/bin/npm
```

### Port 3100 optaget
```bash
lsof -iTCP:3100 -sTCP:LISTEN
```
Dræb den gamle proces eller skift port i `package.json` (scripts.start).

### Tilgængelighed fra LAN
`npm start` lytter default på `0.0.0.0:3100` → andre enheder på dit
netværk kan åbne `http://<mac-ip>:3100`. Slå fra ved at tilføje
`-H 127.0.0.1` i `package.json`'s start-script.

## 4) Afinstallation

```bash
launchctl unload ~/Library/LaunchAgents/com.jarvis.dashboard.plist
rm ~/Library/LaunchAgents/com.jarvis.dashboard.plist
rm ~/Library/Logs/jarvis.*.log
```
