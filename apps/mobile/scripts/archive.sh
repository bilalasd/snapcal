#!/bin/bash
# Release archive with production env. Usage:
#   scripts/archive.sh              # beta archive (TestFlight-internal OK on pk_test)
#   scripts/archive.sh --production # hard-fails unless Clerk key is pk_live
# Run from apps/mobile. Produces build/Loggi.xcarchive.
set -euo pipefail
cd "$(dirname "$0")/.."

# Export .env.production as real env vars — these outrank every .env* file in
# Expo's precedence, so .env.local can never leak dev values into the bundle.
set -a
source .env.production
set +a

if [[ "${1:-}" == "--production" && "$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" != pk_live* ]]; then
  echo "BLOCKED: .env.production still has a pk_test Clerk key — production builds need pk_live." >&2
  exit 1
fi

ARCHIVE="$PWD/build/Loggi.xcarchive"
(cd ios && pod install)
(cd ios && SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild \
  -workspace Loggi.xcworkspace -scheme Loggi -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive)

# Trust the binary, not the config: verify what actually got embedded.
BUNDLE="$ARCHIVE/Products/Applications/Loggi.app/main.jsbundle"
grep -qo "$EXPO_PUBLIC_API_URL" "$BUNDLE" || { echo "BLOCKED: expected API URL not found in embedded bundle." >&2; exit 1; }
if [[ "${1:-}" == "--production" ]] && grep -q "pk_test" "$BUNDLE"; then
  echo "BLOCKED: pk_test found inside the embedded production bundle." >&2
  exit 1
fi
echo "Archive OK: $ARCHIVE (env verified in embedded bundle)"
echo "Next: Xcode → Window → Organizer → Distribute App (or xcrun altool/Transporter)."
