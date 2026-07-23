# Releasing Loggi

The app is Swift/SwiftUI (`apps/ios`), built with Xcode from an XcodeGen
project — `apps/ios/project.yml` is the source of truth; `Loggi.xcodeproj` is
generated, so run `xcodegen generate` after changing `project.yml`. The API is
Next.js (`apps/api`) on Vercel.

Two channels. **Beta** = TestFlight. **Production** = the same TestFlight-
proven binary promoted in App Store Connect — never a fresh build.

## One-time setup (status tracked here — check off as done)

- [ ] Apple Developer Program enrollment ($99/yr) — required for TestFlight.
      Xcode mints the Apple Distribution certificate on first Distribute.
- [ ] App Store Connect app record for bundle id `com.loggi.app`.
- [ ] Subscription products in App Store Connect: `com.loggi.app.monthly`
      ($4.99) and `com.loggi.app.yearly` ($49.99), each with a 15-day free
      trial. Until they exist, `Product.products(for:)` returns empty and the
      paywall shows only its fallback prices — no one can actually subscribe.
- [ ] App Group `group.com.loggi.app` registered on the account and enabled on
      the app + widget + intents targets (the widget bridge writes to it).
- [ ] Production Clerk instance; swap the `pk_test_…` key for its `pk_live_…`
      key in `apps/ios/Loggi/Config.swift`; set matching live keys on Vercel
      production (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
- [ ] `ANTHROPIC_API_KEY` set on Vercel production (photo analysis 500s
      without it): `printf 'sk-ant-…' | npx vercel env add ANTHROPIC_API_KEY production`
- [ ] Public Privacy Policy + Terms of Use URLs; paywall links to both
      (App Store guideline 3.1.1 — REQUIRED before first submit).

## Beta (TestFlight)

1. **Notes first.** Write the release section in `CHANGELOG.md`
   (`## [X.Y.Z] - date`). No notes → no build.
2. **Clean tree on main**, merged and pushed. `git status` clean.
3. **Quality gates** (from repo root):
   ```bash
   (cd apps/ios && xcodegen generate)   # if project.yml changed
   xcodebuild -project apps/ios/Loggi.xcodeproj -scheme Loggi \
     -destination 'generic/platform=iOS' build          # or ⌘B in Xcode
   xcodebuild test -project apps/ios/Loggi.xcodeproj -scheme Loggi \
     -destination 'platform=iOS Simulator,name=iPhone 17 Pro'   # LoggiTests
   yarn workspace @loggi/api test
   ```
   Then work the **Blocking** items in
   `docs/release/swift-testflight-checklist.md`.
4. **Screenshot sweep** (light + dark) per `docs/screenshots.md`; eyeball
   against `docs/release/compliance-checklist.md` §Visual if screens changed.
5. **Bump version + tag:** set `MARKETING_VERSION` (X.Y.Z) and bump
   `CURRENT_PROJECT_VERSION` (build number — monotonic, never reused) in
   `apps/ios/project.yml`; `xcodegen generate`; commit; tag exactly
   `v<version>-<build>` (e.g. `v0.1.0-1`). Push: `git push origin main --tags`.
6. **Archive:** Xcode → select "Any iOS Device" → Product → Archive (Release
   config). Headless equivalent:
   ```bash
   xcodebuild -project apps/ios/Loggi.xcodeproj -scheme Loggi \
     -configuration Release archive -archivePath build/Loggi.xcarchive
   ```
7. **Upload:** Xcode → Window → Organizer → select the archive → Distribute App
   → App Store Connect. First time: let Xcode create the distribution cert.
8. **TestFlight:** paste the CHANGELOG entry into "What to Test". Internal
   group first. Run the on-device smoke script (below). Promote to the
   external group once it survives a day of real use.

### On-device smoke script (every beta)

- Log a meal by **photo**; confirm calories land on Today.
- Log by **voice** (hold-to-talk from the dial) and by **search**.
- Scan a **barcode**; confirm lookup or the miss card.
- Add a **weigh-in**; Weight chart updates; widget shows today's numbers.
- **Paywall:** plans load with prices; Restore Purchases responds.
- Airplane mode: log a meal, re-enable network, confirm the queue drains.
- **HealthKit:** connect in Settings; a scale weigh-in imports.
- VoiceOver on: tab bar + Today card + dial are all announced sensibly.

## Production (App Store)

1. Beta build has soaked with testers — no new build, promote that binary.
2. **Full compliance pass:** every box in
   `docs/release/compliance-checklist.md`.
3. App Store Connect: version page → select the TestFlight build → paste the
   CHANGELOG entry into "What's New" → **phased release ON** → submit.
4. After approval: verify the tag `v<version>-<build>` is pushed; move the
   CHANGELOG section from Unreleased if anything trailed; note any review
   feedback below.

## API deployment (`apps/api` → Vercel)

Deployed at **https://mealio-api-five.vercel.app** (project `mealio-api`); the
Swift app points at it via `apps/ios/Loggi/Config.swift`.

- Vercel `rootDirectory` is `apps/api`, but deploy from the **repo root**
  (`npx vercel deploy --prod`) so the Yarn workspace resolves `@loggi/shared`.
- Production env already set: `DATABASE_URL`, `CLERK_SECRET_KEY`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`,
  `SESSION_SECRET`, `APP_BASE_URL`. Add `ANTHROPIC_API_KEY` (see setup above).

## Review feedback log

(append App Store review outcomes here)
