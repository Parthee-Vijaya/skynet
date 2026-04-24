# Skynet Portal — Autostart

Kør Skynet-portalen som altid-tændt baggrundsservice på macOS via `launchd`.

## 1) Skynet Portal (LaunchAgent)

LaunchAgent'en starter `npm start` (port 3100) ved login og genstarter
automatisk hvis processen crasher. Bygges én gang med
`npm run build --workspace=@skynet/portal` — og igen ved kode-ændringer.

### Installation

**Hurtig vej:** kør installeren i monorepoets rod:

```bash
cd ~/skynet
./scripts/install.sh
```

Scriptet bygger + installerer både portal- og daemon-LaunchAgents (samt
renamer den gamle `com.jarvis.dashboard` plist hvis den findes).

### Manuel installation

```bash
cd ~/skynet

# 1) Byg production bundle
npm install
npm run build:daemon
npm run build --workspace=@skynet/portal

# 2) Kopier plist til LaunchAgents
cp packages/portal/scripts/com.skynet.portal.plist ~/Library/LaunchAgents/

# 3) Load + start
launchctl load ~/Library/LaunchAgents/com.skynet.portal.plist

# 4) Verificér
launchctl list | grep skynet
# Forventet output: PID  0  com.skynet.portal
curl -s http://localhost:3100/api/system | head
```

### Hverdagskommandoer

| Opgave | Kommando |
|---|---|
| Status | `launchctl list \| grep skynet` |
| Stop + unload | `launchctl unload ~/Library/LaunchAgents/com.skynet.portal.plist` |
| Start igen | `launchctl load ~/Library/LaunchAgents/com.skynet.portal.plist` |
| Genstart efter deploy | `launchctl kickstart -k gui/$(id -u)/com.skynet.portal` |
| Live-logs (stdout) | `tail -f ~/Library/Logs/skynet-portal.out.log` |
| Live-logs (stderr) | `tail -f ~/Library/Logs/skynet-portal.err.log` |

### Deploy nye kode-ændringer

```bash
cd ~/skynet
git pull
npm install
npm run build:daemon
npm run build --workspace=@skynet/portal
launchctl kickstart -k gui/$(id -u)/com.skynet.portal
launchctl kickstart -k gui/$(id -u)/com.skynet.daemon
```

## 2) LM Studio (GUI-variant)

Den nemmeste og mest robuste opsætning — LM Studio starter selv med
macOS og auto-loader dine sidst-brugte modeller.

1. Åbn **LM Studio** → klik på **Developer** i venstre sidebjælke
2. Slå **"Start server on app launch"** til (grønt toggle)
3. Slå **"Auto-load previously loaded models"** til
4. Load dine foretrukne modeller én gang manuelt (fx `gpt-oss-20b`,
   `mistral-small-3.2`, `munin-7b-alpha`)
5. Åbn **Systemindstillinger → Generelt → Login-emner** → klik `+` → tilføj
   **LM Studio.app**

Efter næste genstart kører både LM Studio + Skynet automatisk. Åbn
`http://localhost:3100/minimal` i browseren når du har brug for det.

### Verificér LM Studio-backend

```bash
curl -s http://localhost:1234/v1/models | python3 -m json.tool
```

Forventet: JSON med `data[]` der indeholder id'er for de loaded modeller.

## 3) Fejlfinding

### Portalen kører ikke efter login
```bash
# Se stderr for opstartsfejl
tail -50 ~/Library/Logs/skynet-portal.err.log

# Tjek at plist er valid XML
plutil -lint ~/Library/LaunchAgents/com.skynet.portal.plist

# Tving reload
launchctl unload ~/Library/LaunchAgents/com.skynet.portal.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.skynet.portal.plist
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
netværk kan åbne `http://<mac-ip>:3100`. Det er nødvendigt for PWA +
iPhone-adgang. Slå fra ved at tilføje `-H 127.0.0.1` i
`package.json`'s start-script.

## 4) Migration fra gammel `com.jarvis.dashboard`

Projektet hed tidligere "jarvis". Hvis du har en eksisterende installation
der stadig bruger det gamle navn, rename den:

```bash
# 1) Stop gammel LaunchAgent
launchctl bootout gui/$(id -u)/com.jarvis.dashboard 2>/dev/null
rm ~/Library/LaunchAgents/com.jarvis.dashboard.plist

# 2) Installer ny skynet-plist (se "Manuel installation" ovenfor)
cp packages/portal/scripts/com.skynet.portal.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.skynet.portal.plist

# 3) Ryd gamle logs
rm ~/Library/Logs/jarvis.*.log 2>/dev/null
```

## 5) Afinstallation

```bash
launchctl unload ~/Library/LaunchAgents/com.skynet.portal.plist
rm ~/Library/LaunchAgents/com.skynet.portal.plist
rm ~/Library/Logs/skynet-portal.*.log
```
