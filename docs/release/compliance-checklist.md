# Compliance checklist — WCAG 2.2 AA · Apple HIG · App Store Review

Run the FULL list before every production submit. For betas, run §Visual on
screens that changed. Mechanical build gates (Release config excludes DEBUG
surfaces, unit tests pass) live in `docs/release/swift-testflight-checklist.md`
and are not repeated here.

## §Visual — WCAG + HIG (verify with the screenshot loop, light AND dark)

- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 for ≥18pt/14pt-bold). Spot-check pastel
      cards: black-on-lime, black-on-cream, black-on-lilac, black-on-coral,
      and the white-on-vermilion streak badge.
- [ ] All touch targets ≥ 44×44pt (including hitSlop). New icon buttons
      measured, not assumed.
- [ ] Dynamic Type: at the largest accessibility size, no essential text
      truncates; layouts reflow (sim: Settings → Accessibility → Larger Text).
- [ ] Dark mode intentional on every changed screen — no hardcoded inks on
      themed surfaces (fixed pastel cards keep black ink by design).
- [ ] Nothing conveyed by color alone (over-budget states pair icon + text).
- [ ] Reduce Motion honored: decorative animations (dial fan-out, card
      entrances, press-scale) disabled when the setting is on.

## §VoiceOver / input (on device)

- [ ] Every interactive element announces a meaningful label; icon-only
      buttons especially (dial actions, close ✕, day arrows).
- [ ] Reading order is logical on Today, Add review, Onboarding.
- [ ] Custom gestures have button/menu equivalents (dial drag → tap works;
      day-swipe → arrows exist; hold-to-talk → speak screen tap).
- [ ] Keyboard/Switch Control can reach every control in the auth + settings
      forms.

## §App Store Review

- [ ] Privacy nutrition labels in App Store Connect match reality: health
      data (weight, meals), identifiers (Clerk user id), diagnostics
      (Sentry). Health data is NEVER used for tracking/ads.
- [ ] Every `NS*UsageDescription` string in `apps/ios/Loggi/Info.plist` (set
      via `project.yml`) accurately describes use (camera, mic, speech, HealthKit).
- [ ] Sign in with Apple present wherever any third-party sign-in shows,
      listed first.
- [ ] Account deletion reachable in-app (Settings → Delete account) and
      actually erases server data.
- [ ] IAP (guideline 3.1.1): subscriptions purchasable only via StoreKit;
      price + billing period visible before purchase; Restore Purchases
      works on a clean install; paywall links to Privacy Policy AND Terms
      of Use (EULA); free-trial terms accurate.
- [ ] No test/debug UI reachable — the DEBUG-only component gallery and
      preview seed are excluded from Release builds.
- [ ] Export compliance: standard HTTPS only → "uses exempt encryption"
      (set `ITSAppUsesNonExemptEncryption=false` in `apps/ios/Loggi/Info.plist`
      to skip the per-build question).
- [ ] Age rating questionnaire answered (health/wellness, no restricted
      content).

## §Store assets

- [ ] Screenshot sets current (6.9" required; reuse the screenshot-loop
      captures, status bar clean).
- [ ] Name, subtitle, keywords, description reviewed; support URL live;
      privacy policy URL live.
