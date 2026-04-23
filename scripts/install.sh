#!/usr/bin/env bash
#
# S.K.Y.N.E.T. — Unified installer for macOS.
#
# Brug:
#   curl -fsSL https://raw.githubusercontent.com/Parthee-Vijaya/skynet/main/scripts/install.sh | bash
#
# Installerer:
#   1. Homebrew, Node 20+, git (hvis mangler)
#   2. Kloner skynet til ~/skynet
#   3. npm install (workspaces)
#   4. Bygger daemon (highlight + relay + server + cli)
#   5. Opsætter 2 LaunchAgents: portal (3100) + daemon (6767)
#   6. Valgfrit: bygger Swift HUD (hvis Xcode er tilgængelig)
#   7. Åbner http://localhost:3100/setup
#
# Idempotent — kan køres flere gange.

set -euo pipefail

C_BLUE='\033[0;34m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[0;33m'
C_RED='\033[0;31m'
C_DIM='\033[2m'
C_RESET='\033[0m'

info()  { echo -e "${C_BLUE}▌${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo -e "${C_YELLOW}⚠${C_RESET} $*"; }
err()   { echo -e "${C_RED}✗${C_RESET} $*" >&2; }
step()  { echo; echo -e "${C_BLUE}━━━ $* ━━━${C_RESET}"; }

SKYNET_HOME="${SKYNET_HOME:-$HOME/skynet}"
REPO_URL="${SKYNET_REPO:-https://github.com/Parthee-Vijaya/skynet.git}"

# ── Preflight ────────────────────────────────────────────────────────────
step "Preflight"

if [[ "$(uname)" != "Darwin" ]]; then
  err "Skynet er kun bygget til macOS. Afbryder."
  exit 1
fi
ok "macOS $(sw_vers -productVersion)"

if [[ "$(uname -m)" == "arm64" ]]; then
  BREW_PREFIX="/opt/homebrew"
else
  BREW_PREFIX="/usr/local"
fi
ok "Arkitektur: $(uname -m)"

# ── Homebrew ─────────────────────────────────────────────────────────────
step "Homebrew"

if ! command -v brew >/dev/null 2>&1; then
  info "Installerer Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$($BREW_PREFIX/bin/brew shellenv)"
  ok "Homebrew installeret"
else
  ok "Homebrew findes"
fi

# ── Node ─────────────────────────────────────────────────────────────────
step "Node.js"

NODE_MIN_MAJOR=20
NEED_NODE=0
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v | sed 's/v//')
  NODE_MAJOR="${NODE_VER%%.*}"
  if (( NODE_MAJOR < NODE_MIN_MAJOR )); then
    warn "Node $NODE_VER er for gammel (kræver $NODE_MIN_MAJOR+)"
    NEED_NODE=1
  else
    ok "Node $NODE_VER"
  fi
else
  NEED_NODE=1
fi

if (( NEED_NODE == 1 )); then
  info "Installerer node@20 via brew…"
  brew install node@20
  brew link --overwrite --force node@20 || true
  ok "Node $(node -v) installeret"
fi

# ── git ──────────────────────────────────────────────────────────────────
step "git"

if ! command -v git >/dev/null 2>&1; then
  info "Installerer git…"
  brew install git
fi
ok "git $(git --version | awk '{print $3}')"

# ── Repo ─────────────────────────────────────────────────────────────────
step "Repo"

if [[ -d "$SKYNET_HOME/.git" ]]; then
  info "Repo findes i $SKYNET_HOME — opdaterer…"
  cd "$SKYNET_HOME"
  git pull --ff-only || warn "Kunne ikke fast-forward — tjek lokale changes"
else
  SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
  SCRIPT_DIR=""
  if [[ -n "$SCRIPT_SOURCE" && "$SCRIPT_SOURCE" != "bash" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" 2>/dev/null && pwd)" || SCRIPT_DIR=""
  fi
  if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/../package.json" ]]; then
    SKYNET_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"
    info "Bruger eksisterende clone: ${SKYNET_HOME}"
  else
    info "Kloner ${REPO_URL} til ${SKYNET_HOME}…"
    git clone "$REPO_URL" "$SKYNET_HOME"
  fi
fi
ok "Repo: $SKYNET_HOME"

# ── npm install ──────────────────────────────────────────────────────────
step "Dependencies"

cd "$SKYNET_HOME"
if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
  info "Kører npm install (workspaces — kan tage et par minutter)…"
  npm install
fi
ok "node_modules OK"

# ── Build daemon ─────────────────────────────────────────────────────────
step "Build daemon"
info "Bygger highlight + relay + daemon + cli…"
npm run build:daemon
ok "Daemon build færdig"

# ── Build portal ─────────────────────────────────────────────────────────
step "Build portal"
info "Bygger portal (Next.js)…"
npm run build --workspace=@skynet/portal
ok "Portal build færdig"

# ── LaunchAgents ─────────────────────────────────────────────────────────
step "LaunchAgents"

NPM_PATH="$(command -v npm)"
NODE_DIR="$(dirname "$NPM_PATH")"
USER_HOME="$HOME"
TARGET_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$TARGET_DIR" "$HOME/Library/Logs"

# Portal LaunchAgent
PORTAL_TEMPLATE="$SKYNET_HOME/packages/portal/scripts/com.skynet.portal.template.plist"
PORTAL_PLIST="$TARGET_DIR/com.skynet.portal.plist"
PORTAL_LABEL="com.skynet.portal"

if [[ -f "$PORTAL_TEMPLATE" ]]; then
  sed \
    -e "s|__SKYNET_HOME__|$SKYNET_HOME/packages/portal|g" \
    -e "s|__NPM_PATH__|$NPM_PATH|g" \
    -e "s|__NODE_DIR__|$NODE_DIR|g" \
    -e "s|__USER_HOME__|$USER_HOME|g" \
    "$PORTAL_TEMPLATE" > "$PORTAL_PLIST"
  ok "Portal plist: $PORTAL_PLIST"
else
  warn "Portal template mangler: $PORTAL_TEMPLATE"
fi

# Daemon LaunchAgent
cat > "$TARGET_DIR/com.skynet.daemon.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.skynet.daemon</string>
    <key>WorkingDirectory</key>
    <string>${SKYNET_HOME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NPM_PATH}</string>
        <string>start</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${NODE_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>${USER_HOME}/Library/Logs/skynet-daemon.out.log</string>
    <key>StandardErrorPath</key>
    <string>${USER_HOME}/Library/Logs/skynet-daemon.err.log</string>
</dict>
</plist>
PLIST
ok "Daemon plist: $TARGET_DIR/com.skynet.daemon.plist"

# Bootstrap begge services
DOMAIN="gui/$(id -u)"
for LABEL in "$PORTAL_LABEL" "com.skynet.daemon"; do
  PLIST_FILE="$TARGET_DIR/${LABEL}.plist"
  if [[ ! -f "$PLIST_FILE" ]]; then continue; fi
  if launchctl list | grep -q "$LABEL"; then
    info "$LABEL kørte allerede — genindlæser"
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    sleep 1
  fi
  launchctl bootstrap "$DOMAIN" "$PLIST_FILE"
  launchctl kickstart -k "$DOMAIN/$LABEL" 2>/dev/null || true
  ok "$LABEL startet"
done

# ── Valgfrit: Swift HUD ─────────────────────────────────────────────────
step "Swift HUD (valgfrit)"

if command -v xcodebuild >/dev/null 2>&1; then
  info "Xcode fundet — bygger Swift HUD…"
  if [[ -f "$SKYNET_HOME/packages/hud/run-dev.sh" ]]; then
    (cd "$SKYNET_HOME/packages/hud" && bash run-dev.sh) || warn "HUD build fejlede — fortsætter"
    ok "HUD bygget"
  else
    warn "run-dev.sh ikke fundet i packages/hud/"
  fi
else
  info "Xcode ikke installeret — springer HUD over"
fi

# ── Health check ─────────────────────────────────────────────────────────
step "Venter på services…"

for PORT_LABEL in "3100:Portal" "6767:Daemon"; do
  PORT="${PORT_LABEL%%:*}"
  NAME="${PORT_LABEL##*:}"
  for i in {1..30}; do
    if curl -s -f -o /dev/null "http://localhost:${PORT}" 2>/dev/null; then
      ok "$NAME svarer på port $PORT"
      break
    fi
    if (( i == 30 )); then
      warn "$NAME svarede ikke indenfor 30s"
    fi
    sleep 1
  done
done

# ── Done ─────────────────────────────────────────────────────────────────
step "Næste skridt"
ok "S.K.Y.N.E.T. kører!"
info "Åbner setup-wizard…"
open "http://localhost:3100/setup" 2>/dev/null || true

cat <<EOF

${C_GREEN}S.K.Y.N.E.T. er installeret og starter automatisk ved login.${C_RESET}

${C_DIM}Services:${C_RESET}
  Portal:  http://localhost:3100
  Daemon:  http://localhost:6767

${C_DIM}Kommandoer:${C_RESET}
  Start:   launchctl kickstart -k gui/\$(id -u)/com.skynet.portal
  Stop:    launchctl bootout gui/\$(id -u)/com.skynet.portal
  Logs:    tail -f ~/Library/Logs/skynet-daemon.err.log
  Opdater: cd $SKYNET_HOME && git pull && npm install && npm run build:daemon

EOF
