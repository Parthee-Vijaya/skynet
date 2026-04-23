#!/bin/bash
# run-dev.sh — build Debug and launch the .app directly.
# No DMG, no drag-to-Applications. Use this to iterate fast on UX tweaks.
#
# Usage:
#   ./run-dev.sh              # build + run
#   ./run-dev.sh --no-build   # just launch the last build
#
set -e

cd "$(dirname "$0")"

PROJECT="Skynet.xcodeproj"
SCHEME="Skynet"
BUILD_DIR="build-debug"
APP_PATH="$BUILD_DIR/Build/Products/Debug/Skynet.app"

# Always kill any running instance so Keychain + mic don't get double-bound.
if pgrep -x Skynet > /dev/null; then
    echo "▶ killing running Skynet…"
    pkill -x Skynet || true
    sleep 0.4
fi

if [[ "${1:-}" != "--no-build" ]]; then
    echo "▶ building Debug…"

    # Prefer the persistent "Skynet Dev" self-signed identity when it
    # exists — makes macOS Keychain ACLs ("Always Allow" for Gemini key)
    # survive rebuilds. Run `./create-dev-signing-cert.sh` once to
    # install it. Without the cert, we fall back to Xcode's automatic
    # signing (required by Widget Extension App Groups).
    BUILD_ARGS=(
        -project "$PROJECT"
        -scheme "$SCHEME"
        -configuration Debug
        -derivedDataPath "$BUILD_DIR"
    )
    DEV_IDENTITY="Skynet Dev"
    if security find-identity -v -p codesigning 2>/dev/null | grep -q "$DEV_IDENTITY"; then
        echo "▶ using persistent code-signing identity '$DEV_IDENTITY'"
        BUILD_ARGS+=(
            CODE_SIGN_STYLE=Manual
            CODE_SIGN_IDENTITY="$DEV_IDENTITY"
            DEVELOPMENT_TEAM=""
        )
    else
        echo "▶ '$DEV_IDENTITY' not found — using Xcode automatic signing"
        echo "  (tip: run ./create-dev-signing-cert.sh once to avoid Keychain re-prompts)"
    fi

    xcodebuild "${BUILD_ARGS[@]}" build 2>&1 \
        | grep -E "(error:|warning:|BUILD SUCCEEDED|BUILD FAILED)" | head -30
fi

if [[ ! -d "$APP_PATH" ]]; then
    echo "✗ build output missing at $APP_PATH"
    exit 1
fi

# Verify the signature actually bound the Info.plist — if not, TCC churn would
# return and we'd regret shipping the fix. `codesign -dv` surfaces `Info.plist=…`
# (the hash) on a bound binary and `Info.plist=not bound` on a broken one.
if codesign -dv "$APP_PATH" 2>&1 | grep -q "Info.plist=not bound"; then
    echo "⚠  codesign didn't bind Info.plist — TCC will still churn. Check CODE_SIGNING_ALLOWED."
fi

echo "▶ launching $APP_PATH"
open "$APP_PATH"
echo "✓ Skynet running. Tail logs with:  tail -f ~/Library/Logs/Skynet/skynet.log"
