# Taking full-app screenshots on the iOS simulator

Headless, scriptable loop — no tapping required. The Swift app (`apps/ios`)
navigates via a `-route` launch argument and is captured with `simctl`. Works
from a worktree or the main checkout.

A dev-loop script regenerates, builds, installs, and captures in one command:

```sh
cd apps/ios
./scripts/dev-loop.sh [screenshot-path] [route]
```

**Arguments:**
- `screenshot-path`: where to save (default: `/tmp/loggi-screenshot.png`)
- `route`: initial route name (default: today)
  - Examples: `history`, `weight`, `add?intent=speak`, `ask-bevi`, `menu-scout`,
    `onboarding`, `paywall`, `sign-in`, `sign-up`, `reset-password`, `welcome`

**Simulator selection:** auto-selects the first booted iPhone (not iPad), or set
`SIMULATOR_UDID` to use a specific one.

**Dark mode:** `xcrun simctl ui <udid> appearance dark` before running
`dev-loop.sh`, then `… appearance light` to restore.

**Why `-route` instead of `simctl openurl`:** `simctl openurl loggi://…`
triggers an untappable system "Open in Loggi?" confirmation dialog in this
simulator environment (confirmed during Phase 0 development; it occurs even on
repeated opens, not just first-launch), which blocks headless/scripted
navigation. `dev-loop.sh` uses `xcrun simctl launch <udid> com.loggi.app
-route "<value>"` instead — a launch argument the app reads at startup (see
`LoggiApp.initialRoute()`) to set the initial route directly, with no dialog
and no need for the app to already be running.

**Workflow:** take a single route by name, or loop the set:
```sh
for r in history weight settings "add?intent=speak" ask-bevi menu-scout onboarding paywall sign-in; do
  ./scripts/dev-loop.sh "/tmp/shot-$r.png" "$r"
done
```

## Signed-out (auth) screens

AuthGate bounces signed-in users away from the auth routes, and the Clerk
session lives in the sim **keychain**, so uninstalling the app is NOT enough:

```sh
xcrun simctl terminate booted com.loggi.app
xcrun simctl keychain booted reset          # this is what actually signs out
```

Then capture `welcome`, `sign-in`, `sign-up`, `reset-password`. Sign back in by
hand afterwards with the test credentials (see `apps/api/.env.local`).

## Known limits

- The camera viewfinder is black on the simulator (no camera) — expected. Use
  the in-frame photo-library pick to exercise the analyze/review path, or test
  capture on a device.
- Sheets/drawers that need interaction (meal drawer, day picker) need a tap
  driver (`idb`) rather than a deep link.
