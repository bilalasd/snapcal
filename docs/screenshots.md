# Taking full-app screenshots on the iOS simulator

Headless, scriptable loop — no tapping required. Every screen is reached by
deep link (`loggi://…`), captured with `simctl`. Works from a worktree or the
main checkout.

## Swift app (apps/ios)

The Swift rewrite (Phase 0) uses a dev-loop script that regenerates, builds,
installs, and captures in one command:

```sh
cd apps/ios
./scripts/dev-loop.sh [screenshot-path] [route]
```

**Arguments:**
- `screenshot-path`: where to save (default: `/tmp/loggi-screenshot.png`)
- `route`: deep link route, same as the RN table below (default: today)
  - Examples: `history`, `weight`, `add?intent=speak`, `ask-bevi`, `menu-scout`,
    `onboarding`, `paywall`, `sign-in`, `sign-up`, `reset-password`, `welcome`

**Simulator selection:** auto-selects the first booted iPhone (not iPad), or set
`SIMULATOR_UDID` to use a specific one.

**One-time setup:**
- No Metro.
- No permission pre-grants needed (Phase 0 is placeholder-only).
- Dark mode: `xcrun simctl ui <udid> appearance dark` before running
  `dev-loop.sh`, then `… appearance light` to restore.

**Workflow:** take a single route by name, or loop all 9 routes:
```sh
for r in history weight settings "add?intent=speak" ask-bevi menu-scout onboarding paywall sign-in; do
  ./scripts/dev-loop.sh "/tmp/phase0-$r.png" "$r"
done
```

---

## React Native app (apps/mobile)

The Expo app uses Metro and `simctl openurl` for navigation.

## 0. One-time prerequisites

- A booted simulator (`xcrun simctl list devices booted`). Examples below use
  the booted device; add `--device <UDID>` to `expo run:ios` for a specific one.
- **Worktree only:** copy the gitignored files from the main checkout first —
  `apps/mobile/.env.local`, `apps/mobile/ios/sentry.properties`,
  `apps/api/.env.local` — then run `yarn install` and re-apply the bacons
  patches (`apps/mobile/scripts/repatch-bacons.py`, sed its hardcoded ROOT to
  the worktree path). See the full trap list in the "worktree iOS build" notes.

## 1. Start Metro (always from `apps/mobile`, never the repo root)

```sh
cd apps/mobile
npx expo start --port 8081   # keep running; hot-reloads your fixes into the sim
```

## 2. Build & install the dev client (once per native change)

```sh
cd apps/mobile
SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --no-bundler
```

Gotchas that will bite (all found the hard way):

- **`ios.deploymentTarget: 16.4` must exist in `ios/Podfile.properties.json`.**
  A fresh `expo prebuild` drops it (it's in no app.json plugin). Without it,
  autolinking silently skips `ExpoSpeechRecognition` (needs iOS 16.4) and the
  app crashes at launch with "Cannot find native module". If the pbxproj was
  also regenerated, fix it too:
  `sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = 15.1/IPHONEOS_DEPLOYMENT_TARGET = 16.4/g' ios/Loggi.xcodeproj/project.pbxproj`
  then re-run `pod install` (verify: `grep -c ExpoSpeechRecognition ios/Podfile.lock` ≥ 1).
- `SENTRY_DISABLE_AUTO_UPLOAD=true` is required — sentry.properties has no org,
  so the source-map upload phase otherwise fails the build.
- If `expo run:ios` "succeeds" but skipped `pod install`, run `pod install`
  manually in `ios/`.

## 3. Pre-grant permissions (avoids un-tappable system dialogs)

```sh
xcrun simctl privacy booted grant camera com.loggi.app
xcrun simctl privacy booted grant microphone com.loggi.app
# speech recognition can't be granted via `privacy` — insert into TCC directly:
sqlite3 ~/Library/Developer/CoreSimulator/Devices/<UDID>/data/Library/TCC/TCC.db \
  "INSERT OR REPLACE INTO access (service, client, client_type, auth_value, auth_reason, auth_version) \
   VALUES ('kTCCServiceSpeechRecognition','com.loggi.app',0,2,4,1);"
```

If a permission alert is already stuck on screen, it survives app restarts —
reboot the sim (`simctl shutdown` + `boot`) to clear it.

## 4. Capture the signed-in screens

`SHOTS` = output dir. Two-second settle after each navigation is enough.

```sh
xcrun simctl launch booted com.loggi.app && sleep 8
xcrun simctl io booted screenshot "$SHOTS/01-today.png"

shoot() { xcrun simctl openurl booted "loggi://$1"; sleep 4;
          xcrun simctl io booted screenshot "$SHOTS/$2.png"; }
shoot history          02-history
shoot weight           03-weight
shoot settings         04-settings
shoot ask-bevi         05-ask-bevi
```

The `/add` modal **does not remount** when you re-open it with a different
`intent` — restart the app between add-flow captures:

```sh
cap() { xcrun simctl terminate booted com.loggi.app 2>/dev/null
        xcrun simctl launch booted com.loggi.app >/dev/null; sleep 8
        xcrun simctl openurl booted "loggi://$1"; sleep 5
        xcrun simctl io booted screenshot "$SHOTS/$2.png"; }
cap "add?intent=search" 06-add-search
cap "add?intent=saved"  07-add-saved
cap "add?intent=speak"  08-add-speak
cap "add"               09-add-camera     # viewfinder is black on sim — expected
cap "menu-scout"        10-menu-scout
cap "onboarding"        11-onboarding
```

## 5. Capture the signed-out (auth) screens

AuthGate bounces signed-in users away from `(auth)`, and the Clerk session
lives in the sim **keychain**, so uninstalling the app is NOT enough:

```sh
xcrun simctl terminate booted com.loggi.app
xcrun simctl keychain booted reset          # this is what actually signs out
xcrun simctl launch booted com.loggi.app && sleep 12
xcrun simctl io booted screenshot "$SHOTS/12-welcome.png"
shoot sign-in        13-sign-in
shoot sign-up        14-sign-up
shoot reset-password 15-reset-password
```

Afterwards the sim is signed out for real — sign back in by hand with the
test credentials (see `apps/api/.env.local`).

## 6. Keeping dev noise out of the shots

The LogBox "Open debugger to view warnings" toast shows in dev builds and
can't be tapped away headlessly. For a clean capture session, temporarily add
to the top of `app/_layout.tsx` (and **remove it afterwards**):

```ts
if (__DEV__) require("react-native").LogBox.ignoreAllLogs(true);
```

## Known limits

- No tap driver: modals/sheets that require interaction (meal drawer, day
  picker, camera capture states) aren't reachable. `idb` is installed but
  broken (asyncio bug); the sim runs headless so AppleScript clicking is out.
- The welcome pager shows page 1 only (swiping needs a driver).
- The speak screen's live "listening" transcript needs the speech permission
  granted (step 3), otherwise you get the denied state.
- Dark mode: `xcrun simctl ui booted appearance dark` before capturing,
  `… appearance light` to restore.
