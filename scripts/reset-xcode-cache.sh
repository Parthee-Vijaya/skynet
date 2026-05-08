#!/usr/bin/env bash
# scripts/reset-xcode-cache.sh
#
# Rydder Xcode's cache + DerivedData for Skynet HUD og åbner projektet
# rent. Bruges når Xcode crasher eller serverer stale build-info.
#
# Sletter KUN Skynet-relateret data — andre projekters DerivedData er
# uberørt. Indeholder ikke kildekode, så det er sikkert at gentage.
#
# Brug: bash scripts/reset-xcode-cache.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
XCODEPROJ="$PROJECT_DIR/packages/hud/Skynet.xcodeproj"

# ── 1. Quit Xcode hvis det kører ────────────────────────────────────────────
if pgrep -x "Xcode" > /dev/null; then
  echo "→ Xcode kører — lukker det rent…"
  osascript -e 'tell application "Xcode" to quit' 2>/dev/null || true
  # Vent op til 5 sek på at Xcode lukker
  for i in {1..10}; do
    if ! pgrep -x "Xcode" > /dev/null; then break; fi
    sleep 0.5
  done
  if pgrep -x "Xcode" > /dev/null; then
    echo "  Xcode reagerer ikke — force-quitter"
    pkill -9 Xcode 2>/dev/null || true
    sleep 1
  fi
  echo "✓ Xcode lukket"
fi

# ── 2. Slet Skynet's DerivedData ────────────────────────────────────────────
DERIVED="$HOME/Library/Developer/Xcode/DerivedData"
if [ -d "$DERIVED" ]; then
  COUNT=$(find "$DERIVED" -maxdepth 1 -name "Skynet-*" -type d 2>/dev/null | wc -l | tr -d ' ')
  if [ "$COUNT" -gt 0 ]; then
    echo "→ Sletter $COUNT Skynet DerivedData-folder(e)…"
    rm -rf "$DERIVED"/Skynet-*
    echo "✓ DerivedData ryddet"
  else
    echo "✓ Ingen Skynet DerivedData at rydde"
  fi
fi

# ── 3. Slet ModuleCache (sjældent nødvendigt, men gratis at gøre) ──────────
MODULE_CACHE="$HOME/Library/Developer/Xcode/DerivedData/ModuleCache.noindex"
if [ -d "$MODULE_CACHE" ]; then
  echo "→ Rydder ModuleCache…"
  rm -rf "$MODULE_CACHE"
  echo "✓ ModuleCache ryddet"
fi

# ── 4. Slet xcuserdata (per-user state — Xcode regenererer det) ────────────
USERDATA="$XCODEPROJ/project.xcworkspace/xcuserdata"
if [ -d "$USERDATA" ]; then
  echo "→ Rydder workspace xcuserdata…"
  rm -rf "$USERDATA"
  echo "✓ xcuserdata ryddet"
fi

# ── 5. Åbn projektet rent ──────────────────────────────────────────────────
if [ -d "$XCODEPROJ" ]; then
  echo
  echo "→ Åbner $XCODEPROJ…"
  open "$XCODEPROJ"
  echo "✓ Færdig — vent på at Xcode indekserer (~30 sek), tryk derefter ⌘+B"
else
  echo "✗ Skynet.xcodeproj ikke fundet på $XCODEPROJ"
  exit 1
fi
