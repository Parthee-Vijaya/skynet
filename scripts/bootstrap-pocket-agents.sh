#!/usr/bin/env bash
#
# bootstrap-pocket-agents.sh
#
# Sætter din Mac op til at køre "coding agents in your pocket"-setup fra
# https://simonbs.dev/posts/put-your-coding-agents-in-your-pocket/ — integreret
# med Skynet-portalen:
#
#   1. tmux (baggrundssessioner til Claude Code / Codex / etc.)
#   2. brrr CLI (push-notif når agent er idle)
#   3. Tailscale SSH (privat SSH-netværk — Tailscale antages installeret)
#   4. ~/.zshrc auto-attach til tmux "agents"-session ved SSH-login
#   5. brrr webhook peger mod Skynet-portalens /api/agent-events
#
# Idempotent: kan køres igen for at opdatere eller reparere.
# Destruktive operationer (zshrc-modificering) laver timestamped backup først.

set -Eeuo pipefail

# ── Pretty-print ────────────────────────────────────────────────────────────
C_DIM='\033[2m'; C_BOLD='\033[1m'; C_OK='\033[32m'; C_WARN='\033[33m'; C_RESET='\033[0m'
step()  { printf "${C_BOLD}▸ %s${C_RESET}\n" "$*"; }
ok()    { printf "  ${C_OK}✓${C_RESET} %s\n" "$*"; }
warn()  { printf "  ${C_WARN}⚠${C_RESET} %s\n" "$*"; }
dim()   { printf "  ${C_DIM}%s${C_RESET}\n" "$*"; }

# ── Preflight ───────────────────────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  echo "Dette script kører kun på macOS." >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew mangler. Installer først via https://brew.sh — eller kør scripts/install.sh" >&2
  exit 1
fi

# ── 1. tmux ─────────────────────────────────────────────────────────────────
step "tmux"
if command -v tmux >/dev/null 2>&1; then
  ok "tmux er allerede installeret ($(tmux -V))"
else
  dim "installerer via Homebrew..."
  brew install tmux >/dev/null
  ok "tmux installeret"
fi

# ── 2. brrr CLI ─────────────────────────────────────────────────────────────
step "brrr CLI (push-notif når agent er idle)"
if command -v brrr >/dev/null 2>&1; then
  ok "brrr er allerede installeret ($(brrr --version 2>/dev/null || echo '?'))"
else
  dim "tap + install..."
  brew tap simonbs/brrr-cli https://github.com/simonbs/brrr-cli.git 2>/dev/null || true
  brew install brrr >/dev/null
  ok "brrr installeret"
fi

# ── 3. Tailscale SSH status ────────────────────────────────────────────────
step "Tailscale SSH"
if ! command -v tailscale >/dev/null 2>&1 && [[ ! -x "/Applications/Tailscale.app/Contents/MacOS/Tailscale" ]]; then
  warn "Tailscale er ikke installeret. Installer fra https://tailscale.com/download/mac"
  warn "Skippet tailscale-konfiguration — kør scriptet igen efter install"
else
  TAILSCALE_BIN="$(command -v tailscale || echo /usr/local/bin/tailscale)"
  if "$TAILSCALE_BIN" status >/dev/null 2>&1; then
    if "$TAILSCALE_BIN" status --json 2>/dev/null | grep -q '"RunningSSH": *true'; then
      ok "Tailscale SSH er aktiveret"
    else
      warn "Tailscale kører, men SSH er ikke aktiveret"
      dim "aktivér med: sudo tailscale set --ssh"
    fi
  else
    warn "Tailscale kører ikke (login med 'tailscale up' eller via menu-bar-ikonet)"
  fi
fi

# Hent Tailscale IP hvis muligt — bruges til brrr webhook
TAILSCALE_IP=""
if command -v tailscale >/dev/null 2>&1; then
  TAILSCALE_IP="$(tailscale ip -4 2>/dev/null | head -1 || true)"
fi

# ── 4. ~/.zshrc auto-attach-patch ──────────────────────────────────────────
step "~/.zshrc auto-attach til tmux"
ZSHRC="$HOME/.zshrc"
MARKER="# skynet: auto-attach to tmux on SSH"

if [[ ! -f "$ZSHRC" ]]; then
  touch "$ZSHRC"
fi

if grep -qF "$MARKER" "$ZSHRC"; then
  ok "allerede patchet"
else
  BACKUP="$ZSHRC.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$ZSHRC" "$BACKUP"
  dim "backup: $BACKUP"
  cat >> "$ZSHRC" <<'ZSHPATCH'

# skynet: auto-attach to tmux on SSH
# Når du SSH'er ind (fx fra Termius på iPhone), attaches automatisk til
# en delt "agents" tmux-session — eller opretter den hvis den ikke findes.
if [ -n "$SSH_CONNECTION" ] && [ -z "$TMUX" ]; then
  tmux new-session -A -s agents
fi
ZSHPATCH
  ok "patchet (aktiveres ved næste SSH-login)"
fi

# ── 5. brrr idle-notifikationer (optional) ─────────────────────────────────
# brrr CLI er installeret men kræver en konto på https://brrr.now for at få
# en webhook-URL (formatet 'https://api.brrr.now/v1/br_*'). Skynet's eget
# /api/agent-events endpoint kan bruges som alternativ — kaldes manuelt fra
# Claude Code hooks, cron, eller andre idle-detectors.
step "brrr idle-notifikationer (optional)"
dim "brrr kræver konto på https://brrr.now — de accepterer kun deres egne"
dim "webhook-URLs ('https://api.brrr.now/v1/br_*'), ikke custom endpoints."
dim ""
dim "To måder at aktivere push når Claude er idle:"
dim "  A) Opret konto på https://brrr.now, hent webhook, kør:"
dim "       brrr agent install all --webhook <brrr.now-URL> --idle-seconds 20"
dim "       (push kommer til brrr iOS-appen)"
dim ""
dim "  B) Brug Skynet's eget endpoint direkte — fx fra en Claude Code"
dim "     hook eller en simpel idle-detector. Endpoint:"
if [[ -n "$TAILSCALE_IP" ]]; then
  dim "       POST http://${TAILSCALE_IP}:3100/api/agent-events"
else
  dim "       POST http://localhost:3100/api/agent-events"
fi
dim "     Body: { agent, session, event, idle_seconds?, message? }"
dim "     Push kommer via Skynet's notify() → macOS + ntfy + pushover"

# ── 6. Sammenfatning ────────────────────────────────────────────────────────
echo ""
step "Klar!"
ok "SSH-kommando til iPhone (via Termius/Prompt):"
if [[ -n "$TAILSCALE_IP" ]]; then
  dim "ssh $(whoami)@$TAILSCALE_IP    (Tailscale)"
fi
dim "ssh $(whoami)@$(hostname).local   (lokalt netværk)"
echo ""
ok "Eller åbn Skynet PWA → terminal-fane for browser-terminal"
dim "→ http://localhost:3100/terminal"
if [[ -n "$TAILSCALE_IP" ]]; then
  dim "→ http://${TAILSCALE_IP}:3100/terminal (fra iPhone)"
fi
echo ""
ok "Start din første agent-session:"
dim "tmux new -s agents"
dim "cd ~/dit-projekt && claude"
