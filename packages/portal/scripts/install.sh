#!/usr/bin/env bash
#
# SKYNET — install & bootstrap på ny macOS-maskine.
#
# Brug:
#   curl -fsSL https://raw.githubusercontent.com/Parthee-Vijaya/skynet/main/scripts/install.sh | bash
# eller (hvis repo'et allerede er klonet):
#   ./scripts/install.sh
#
# Hvad scriptet gør:
#   1. Tjekker/installerer Homebrew
#   2. Tjekker/installerer Node 20+ og git
#   3. Kloner repo'et til ~/skynet hvis det ikke allerede er der
#   4. Kører npm install + npm run build
#   5. Installerer LaunchAgent med korrekte stier for denne bruger
#   6. Starter serveren (launchctl bootstrap)
#   7. Åbner http://localhost:3100/setup i browseren
#
# Scriptet er idempotent — kan køres flere gange.

set -euo pipefail

# ── Farver ─────────────────────────────────────────────────────────────────
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

# ── Preflight ─────────────────────────────────────────────────────────────
step "Preflight"

if [[ "$(uname)" != "Darwin" ]]; then
  err "SKYNET er kun bygget til macOS. Afbryder."
  exit 1
fi
ok "macOS $(sw_vers -productVersion)"

# Detektér arkitektur → rigtig Homebrew-prefix
if [[ "$(uname -m)" == "arm64" ]]; then
  BREW_PREFIX="/opt/homebrew"
else
  BREW_PREFIX="/usr/local"
fi
ok "Arkitektur: $(uname -m) → brew prefix: $BREW_PREFIX"

# ── Homebrew ──────────────────────────────────────────────────────────────
step "Homebrew"

if ! command -v brew >/dev/null 2>&1; then
  info "Installerer Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Nyeste brew'er kræver at PATH bliver sat
  eval "$($BREW_PREFIX/bin/brew shellenv)"
  ok "Homebrew installeret"
else
  ok "Homebrew findes ($(brew --version | head -1))"
fi

# ── Node ──────────────────────────────────────────────────────────────────
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
  # Brew installerer 'keg-only' — link så node/npm findes
  brew link --overwrite --force node@20 || true
  ok "Node $(node -v) installeret"
fi

# ── git ───────────────────────────────────────────────────────────────────
step "git"

if ! command -v git >/dev/null 2>&1; then
  info "Installerer git…"
  brew install git
fi
ok "git $(git --version | awk '{print $3}')"

# ── Repo ──────────────────────────────────────────────────────────────────
step "Repo"

SKYNET_HOME="${SKYNET_HOME:-$HOME/skynet}"
REPO_URL="${SKYNET_REPO:-https://github.com/Parthee-Vijaya/skynet.git}"

if [[ -d "$SKYNET_HOME/.git" ]]; then
  info "Repo findes i $SKYNET_HOME — opdaterer…"
  cd "$SKYNET_HOME"
  git pull --ff-only || warn "Kunne ikke fast-forward — tjek lokale changes"
else
  # Hvis scriptet køres fra et eksisterende clone, brug det.
  # NB: ${BASH_SOURCE[0]} er tom når scriptet kører via 'curl | bash',
  #     så vi defaulter til $0 og swallow'er fejl fra dirname/cd.
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

# ── npm install + build ───────────────────────────────────────────────────
step "Dependencies"

cd "$SKYNET_HOME"
if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
  info "Kører npm install (kan tage et par minutter)…"
  npm install
fi
ok "node_modules OK"

step "Build"
info "Kører npm run build…"
npm run build
ok "Build færdig"

# ── LaunchAgent ───────────────────────────────────────────────────────────
step "LaunchAgent"

NPM_PATH="$(command -v npm)"
NODE_DIR="$(dirname "$NPM_PATH")"
USER_HOME="$HOME"

TEMPLATE="$SKYNET_HOME/scripts/com.skynet.portal.template.plist"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$TARGET_DIR/com.skynet.portal.plist"
LABEL="com.skynet.portal"

mkdir -p "$TARGET_DIR"
mkdir -p "$HOME/Library/Logs"

if [[ ! -f "$TEMPLATE" ]]; then
  err "Template mangler: $TEMPLATE"
  exit 1
fi

# Brug | som separator fordi stier kan indeholde / (men ikke |)
sed \
  -e "s|__SKYNET_HOME__|$SKYNET_HOME|g" \
  -e "s|__NPM_PATH__|$NPM_PATH|g" \
  -e "s|__NODE_DIR__|$NODE_DIR|g" \
  -e "s|__USER_HOME__|$USER_HOME|g" \
  "$TEMPLATE" > "$TARGET_PLIST"

ok "plist installeret: $TARGET_PLIST"

# Bootstrap (hvis allerede kørende, bootout først for at genindlæse)
DOMAIN="gui/$(id -u)"
if launchctl list | grep -q "$LABEL"; then
  info "LaunchAgent kørte allerede — bootout + ny bootstrap"
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  sleep 1
fi

launchctl bootstrap "$DOMAIN" "$TARGET_PLIST"
ok "LaunchAgent loaded i domain $DOMAIN"

# Kickstart for at sikre den starter nu
launchctl kickstart -k "$DOMAIN/$LABEL" 2>/dev/null || true

# ── Venter på at serveren svarer ──────────────────────────────────────────
step "Venter på server på port 3100…"
for i in {1..30}; do
  if curl -s -f -o /dev/null http://localhost:3100/api/system 2>/dev/null; then
    ok "Server svarer"
    break
  fi
  if (( i == 30 )); then
    warn "Serveren svarede ikke indenfor 30s. Tjek log: ~/Library/Logs/skynet.err.log"
  fi
  sleep 1
done

# ── Åbn browser til setup-wizard ──────────────────────────────────────────
step "Næste skridt"
ok "SKYNET kører på http://localhost:3100"
info "Åbner setup-wizard i din browser…"
open "http://localhost:3100/setup" 2>/dev/null || true

cat <<EOF

${C_GREEN}SKYNET er installeret og starter automatisk ved login.${C_RESET}

${C_DIM}Brugskommandoer:${C_RESET}
  Start:        launchctl kickstart -k gui/\$(id -u)/$LABEL
  Stop:         launchctl bootout gui/\$(id -u)/$LABEL
  Logs:         tail -f ~/Library/Logs/skynet.err.log
  Opdater:      cd $SKYNET_HOME && git pull && npm install && npm run build && launchctl kickstart -k gui/\$(id -u)/$LABEL

${C_DIM}Valgfri integrationer (åbn http://localhost:3100/setup):${C_RESET}
  • LM Studio   — lokal chat-AI (load modeller + start Local Server på port 1234)
  • Plex        — medie-widget (indtast plex_token i settings)
  • NZBGeek     — downloads-widget (indtast rss_url)
  • Tailscale   — services-control

Se README.md for detaljer.
EOF
