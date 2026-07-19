# Release process: beta + production, with compliance gates

Date: 2026-07-19 · Status: awaiting approval

## Goal

A repeatable, documented way to ship Loggi to TestFlight (beta) and the App
Store (production), where every build carries a version number and release
notes, and no build ships without passing WCAG/HIG/App Store compliance gates.

## Decisions already made

- **Local Xcode builds, no EAS.** Proven this session: `pod install` +
  `xcodebuild archive` succeed locally; the archive contains both extensions
  (LoggiWidgets.appex, LoggiIntents.appex) signed under team L8GMK24E8Q.
  SHIP.md's "local pods hang" note is stale. EAS remains a documented fallback
  only. Saves ~$19/mo and a service dependency.
- **Runbook + scripted gates, no CI.** Solo project, low release cadence;
  automation can come later without redesign.
- **Beta = TestFlight; production = the same TestFlight-proven binary
  promoted in App Store Connect.** Never submit a fresh build to production.

## Versioning & release notes (required on every build)

- **Marketing version** (`expo.version` in app.json): semver `X.Y.Z`.
  Patch = fixes only; minor = features; major = reserved for relaunch-scale
  changes.
- **Build number** (`expo.ios.buildNumber` in app.json): monotonic integer,
  bumped on *every* archive, never reused (App Store Connect rejects reuse).
  A `scripts/bump-build.sh` does the increment + git commit.
- **Git tag** `v<version>-<build>` (e.g. `v0.2.0-7`) created at archive time,
  so any binary in TestFlight maps to an exact commit.
- **Release notes**: `CHANGELOG.md` at repo root, keep-a-changelog format.
  The runbook's first step is writing the entry for the version being cut;
  that text is pasted into TestFlight "What to Test" (beta) and App Store
  "What's New" (production). No notes → no build.

## Artifacts to create

1. **`RELEASE.md`** (repo root) — the runbook. Sequenced, copy-paste:
   - *Preflight:* clean git on main; `yarn workspace @loggi/mobile typecheck`;
     `yarn workspace @loggi/api test`; bacons repatch check; CHANGELOG entry
     written; version + buildNumber bumped.
   - *Config gates (hard stops, all real findings):*
     - Production Clerk key is `pk_live` — a `pk_test` key anywhere in the
       release config or bundled env aborts the release.
     - `EXPO_PUBLIC_API_URL` points at the production API.
     - `ANTHROPIC_API_KEY` present on Vercel production (photo analysis 500s
       without it — SHIP.md).
     - API deploys happen from repo root (`npx vercel deploy --prod`).
     - `ios/Podfile.properties.json` has `ios.deploymentTarget: 16.4`
       (prebuild silently drops it; speech pod unlinks without it).
   - *Build:* `pod install` → `xcodebuild archive` (Release, generic/iOS,
     `SENTRY_DISABLE_AUTO_UPLOAD=true` until Sentry org is configured) →
     Xcode Organizer → Distribute App → App Store Connect.
   - *Beta:* TestFlight internal group → on-device smoke script (log a meal
     by photo/speech/search, weigh-in, widget renders, paywall loads +
     restore works, offline queue drains) → external group when stable.
   - *Production:* promote the tested build; phased release ON; submit.
   - *Post-release:* verify the tag pushed, close CHANGELOG section, note
     review feedback.
2. **`scripts/release-check.sh`** — mechanical compliance gate, runnable by
   Claude or CI later. Greps the mobile source for the failure classes we
   have actually shipped and fixed:
   - text below 11px (`text-[10px]`, `text-[9px]`, `fontSize: 10` or less);
   - hardcoded hex inks (`color="#…"`) outside the documented fixed-pastel
     allowlist;
   - icon-only `Pressable`/`Button` without `accessibilityLabel`;
   - `pk_test` in any release-path config;
   - `console.log` left in app code;
   - app.json buildNumber unchanged since last tag (forces the bump).
   Exit non-zero on any hit; runbook says a failing check blocks the build.
3. **`docs/release/compliance-checklist.md`** — the manual gate, run before
   every production submit and after any new screen ships. Three sections:
   - **WCAG 2.2 AA + HIG** (merged; they overlap): 4.5:1 text contrast
     (3:1 large), 44pt touch targets, Dynamic Type up to accessibility sizes
     without truncation, VoiceOver labels + logical order, Reduce Motion
     honored, no color-only meaning, keyboard/Switch Control reachability.
     Verified with the simulator screenshot loop (`docs/screenshots.md`) in
     light + dark, plus a VoiceOver spot-check on device.
   - **App Store review requirements:** privacy nutrition labels match actual
     data collection (health data!); all `NS*UsageDescription` strings
     accurate; account deletion in-app (exists — Settings); sign-in options
     include Apple wherever third-party sign-in shows (fixed this session);
     IAP guideline 3.1.1 — subscriptions via StoreKit only, restore purchases
     button (exists), price + term shown before purchase, links to Privacy
     Policy and Terms of Use (EULA) on the paywall **(currently missing —
     must add before first submit)**; export-compliance answer recorded;
     age rating questionnaire; no test/debug UI reachable.
   - **Store assets:** screenshots (6.9" + 6.5" sets), app name/subtitle/
     keywords, support URL, privacy policy URL (must exist publicly),
     marketing URL optional.
4. **`CHANGELOG.md`** — seeded with `0.1.0` covering what exists today.
4b. **`scripts/bump-build.sh`** — increments `expo.ios.buildNumber`, optionally
   sets `expo.version`, commits, and creates the `v<version>-<build>` tag.
5. **SHIP.md** updated: local-build path replaces the stale EAS-only
   instructions; EAS section demoted to fallback.

## What runs when

| Gate | Beta (TestFlight) | Production |
|---|---|---|
| typecheck + tests | ✓ | ✓ |
| `release-check.sh` | ✓ | ✓ |
| Screenshot loop (light+dark) | ✓ | ✓ |
| Manual compliance checklist | new screens only | full pass |
| On-device smoke script | ✓ | already done in beta |

## Known one-time blockers (tracked in RELEASE.md prologue)

- Paid Apple Developer Program enrollment ($99/yr) — required for TestFlight;
  Xcode will mint the Apple Distribution certificate on first Distribute.
- Production Clerk instance + `pk_live` key (current config is `pk_test`).
- `ANTHROPIC_API_KEY` on Vercel production.
- Privacy Policy + Terms pages hosted at a public URL (App Store requires;
  paywall must link them).
- App Store Connect app record (bundle id `com.loggi.app`), IAP subscription
  products created (`MONTHLY_SKU`/`YEARLY_SKU` must match), Sandbox tester
  for IAP verification.

## Out of scope (deliberately)

- CI automation (EAS Workflows / GitHub Actions) — revisit if cadence > ~2
  releases/month.
- Android — iPhone-only by prior decision.
- OTA updates (EAS Update) — not used; JS fixes ship as new builds.
