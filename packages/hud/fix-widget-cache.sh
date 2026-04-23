#!/bin/bash
# fix-widget-cache.sh — reset macOS widget cache so the Skynet widgets
# pick up the latest binary.
#
# Problem: macOS's `chronod` daemon (the widget runtime) caches the
# extension bundle aggressively. Even after a fresh build, the widget
# gallery + Notification Center keep running the *previously-registered*
# appex, so changes to `WidgetSnapshotReader` or the widget timelines
# don't take effect — widgets render `.placeholder` forever.
#
# The fix: purge DerivedData, kill chronod, clean-build, then force
# `lsregister` to re-scan the fresh `.app`. Run this when widgets are
# stuck showing placeholder data after a rebuild.
#
# Run from the Skynet project root. Requires no sudo.

set -e

cd "$(dirname "$0")"

PROJECT="Skynet.xcodeproj"
SCHEME="Skynet"
DERIVED_GLOB="$HOME/Library/Developer/Xcode/DerivedData/Skynet-*"

echo "▶ killing Skynet + chronod…"
killall chronod ChronoServicesAgent Skynet SkynetWidgetExtensionExtension 2>/dev/null || true
sleep 0.5

echo "▶ purging DerivedData + local build output…"
rm -rf $DERIVED_GLOB
rm -rf build-debug build

echo "▶ clean build…"
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Debug clean build \
    2>&1 | grep -E "(error:|BUILD SUCCEEDED|BUILD FAILED)" | tail -5

APP=$(find $DERIVED_GLOB -type d -name "Skynet.app" -path "*/Debug/*" 2>/dev/null | head -1)
if [[ -z "$APP" ]]; then
    echo "✘ couldn't find built Skynet.app in DerivedData"
    exit 1
fi
echo "▶ re-registering $APP with Launch Services…"
LSREG=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
"$LSREG" -u "$APP" 2>/dev/null || true
"$LSREG" -f "$APP"

echo "▶ launching Skynet so chronod re-discovers the widgets…"
open "$APP"

echo ""
echo "✓ Done. If widgets still show placeholder:"
echo "  1. Open Notification Center (⌃⌥⌘ or edge-swipe)"
echo "  2. 'Rediger Widgets' → remove all Skynet widgets → add them back"
echo "  3. Worst case: logout + login, or restart (chronod is sticky)"
