#!/bin/bash
set -euo pipefail

# dev-loop.sh — regenerate, build, install, launch with optional route, and screenshot
# Usage: dev-loop.sh [screenshot-path] [route]
#   screenshot-path: where to save the screenshot (default: /tmp/loggi-screenshot.png)
#   route: optional deep-link route (e.g., history, add?intent=speak; default: today)

SCREENSHOT_PATH="${1:-/tmp/loggi-screenshot.png}"
ROUTE="${2:-}"

# Resolve the directory this script is in, then cd to apps/ios
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(dirname "$SCRIPT_DIR")"

cd "$IOS_DIR"

# Auto-detect a booted iPhone simulator (not iPad).
# If SIMULATOR_UDID is set in the environment, use it; otherwise find the first booted iPhone.
if [[ -n "${SIMULATOR_UDID:-}" ]]; then
    UDID="$SIMULATOR_UDID"
else
    # xcrun simctl list devices booted outputs lines like:
    #   iPhone 16 Pro Max (ABC...XYZ) (Booted)
    # Filter for "iPhone" (not "iPad"), and extract the UDID from parentheses.
    UDID=$(xcrun simctl list devices booted | grep "iPhone" | head -1 | sed -n 's/.*(\([A-F0-9\-]*\)) (Booted).*/\1/p' | tr -d ' ')
    if [[ -z "$UDID" ]]; then
        echo "Error: no booted iPhone simulator found. Boot one with 'xcrun simctl boot <udid>'."
        exit 1
    fi
fi

echo "Using simulator: $UDID"

# Regenerate the Xcode project from project.yml
echo "Regenerating Xcode project..."
xcodegen generate

# Build for the simulator.
echo "Building for simulator..."
xcodebuild \
    -project Loggi.xcodeproj \
    -scheme Loggi \
    -configuration Debug \
    -sdk iphonesimulator \
    -derivedDataPath build \
    build

# Install the app to the simulator.
echo "Installing app to simulator..."
APP_PATH="build/Build/Products/Debug-iphonesimulator/Loggi.app"
xcrun simctl install "$UDID" "$APP_PATH"

# Terminate any existing instance of the app (idempotent).
xcrun simctl terminate "$UDID" com.loggi.app 2>/dev/null || true

# Launch the app with optional -route argument.
if [[ -n "$ROUTE" ]]; then
    echo "Launching with route: $ROUTE"
    # -route avoids the untappable system "Open in Loggi?" dialog that simctl openurl triggers in the simulator
    xcrun simctl launch "$UDID" com.loggi.app -route "$ROUTE"
else
    echo "Launching app..."
    xcrun simctl launch "$UDID" com.loggi.app
fi

# Wait ~2 seconds for the app to settle and render.
sleep 2

# Take a screenshot.
echo "Capturing screenshot to: $SCREENSHOT_PATH"
mkdir -p "$(dirname "$SCREENSHOT_PATH")"
xcrun simctl io "$UDID" screenshot "$SCREENSHOT_PATH"

echo "Done."
