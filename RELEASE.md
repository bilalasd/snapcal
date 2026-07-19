# Releasing Loggi

Two channels. **Beta** = TestFlight. **Production** = the same TestFlight-
proven binary promoted in App Store Connect — never a fresh build.
All commands run from `apps/mobile` unless noted.

## One-time setup (status tracked here — check off as done)

- [ ] Apple Developer Program enrollment ($99/yr) — required for TestFlight.
      Xcode mints the Apple Distribution certificate on first Distribute.
- [ ] App Store Connect app record for bundle id `com.loggi.app`.
- [ ] Subscription products created in App Store Connect matching
      `MONTHLY_SKU` / `YEARLY_SKU` in `lib/purchases.ts`; Sandbox tester
      account for IAP verification.
- [ ] Production Clerk instance; paste its `pk_live_…` key into
      `apps/mobile/.env.production`; set matching live keys on Vercel
      production (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
- [ ] `ANTHROPIC_API_KEY` set on Vercel production (photo analysis 500s
      without it): `printf 'sk-ant-…' | npx vercel env add ANTHROPIC_API_KEY production`
- [ ] Public Privacy Policy + Terms of Use URLs; paywall links to both
      (App Store guideline 3.1.1 — REQUIRED before first submit).

## Beta (TestFlight)

1. **Notes first.** Write the release section in `CHANGELOG.md`
   (`## [X.Y.Z] - date`). No notes → no build.
2. **Clean tree on main**, merged and pushed. `git status` clean.
3. **Quality gates:**
   ```bash
   yarn workspace @loggi/mobile typecheck
   yarn workspace @loggi/api test        # from repo root
   ./scripts/release-check.sh            # from apps/mobile
   ```
4. **Screenshot sweep** (light + dark) per `docs/screenshots.md`; eyeball
   against `docs/release/compliance-checklist.md` §Visual if screens changed.
5. **Bump + tag:** `./scripts/bump-build.sh` (add `--version X.Y.Z` when the
   marketing version changes). Push: `git push origin main --tags`.
6. **Archive:** `./scripts/archive.sh` → `build/Loggi.xcarchive`
   (verifies the embedded bundle env automatically).
7. **Upload:** Xcode → Window → Organizer → select archive → Distribute App
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
- VoiceOver on: tab bar + Today card + dial are all announced sensibly.

## Production (App Store)

1. Beta build has soaked with testers — no new build, promote that binary.
2. **Full compliance pass:** every box in
   `docs/release/compliance-checklist.md`.
3. **Production gates:** `./scripts/release-check.sh --production` (blocks on
   pk_test) and `./scripts/archive.sh --production` if a rebuild was ever
   needed (it shouldn't be — promote the beta binary).
4. App Store Connect: version page → select the TestFlight build → paste the
   CHANGELOG entry into "What's New" → **phased release ON** → submit.
5. After approval: verify the tag `v<version>-<build>` is pushed; move the
   CHANGELOG section from Unreleased if anything trailed; note any review
   feedback at the bottom of this file.

## If local builds ever break (fallback: EAS)

`npx eas build --profile production --platform ios` then
`npx eas submit` — profiles in `eas.json` read `.env.production`. Costs
build credits; only needed if this Mac's toolchain regresses.

## Review feedback log

(append App Store review outcomes here)
