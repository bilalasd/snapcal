# Swift App — Pre-TestFlight Checklist

Status as of 2026-07-21. The app is **functionally complete** (every RN screen
and API route has a Swift counterpart) but **not release-verified**. This
tracks the gap between "builds and looks right" and "known to work".

## Blocking — must happen before a TestFlight build

- [ ] **Swap `pk_test_` → `pk_live_`** in `apps/ios/Loggi/Config.swift`. The
      test key points at a dev Clerk instance; a real build needs the live one.
      (Publishable keys are client-visible by design, so this is a config swap,
      not a secret leak — but the wrong instance means no real users can auth.)
- [ ] **Create the subscription products** in App Store Connect:
      `com.loggi.app.monthly` ($4.99) and `com.loggi.app.yearly` ($49.99),
      each with a 15-day free trial. Until these exist, `Product.products(for:)`
      returns empty and the paywall shows only its fallback prices — no one can
      actually subscribe. For local testing, add a StoreKit configuration file
      to the scheme.
- [ ] **Confirm the App Group** `group.com.loggi.app` is registered on the
      developer account and enabled on the app + widget + intents targets.
      The widget bridge writes to it; without it the widget stays blank.

## Device-only verification (cannot be checked in the simulator)

Everything here is compile- and logic-checked but has never executed against
real hardware or a real transaction:

- [ ] **Camera capture** — shutter → analyze → review → save, on a device.
- [ ] **Barcode scan** — a real EAN/UPC in frame → Open Food Facts → draft.
- [x] **Photo upload** — `/api/photos` round trip with a real JPEG. **VERIFIED**
      2026-07-21 against the live API with a minted Clerk session: HTTP 200,
      response `{url, pathname}` decodes cleanly to `DraftPhoto`.
- [x] **`/api/analyze` with images** — **VERIFIED** with a real breakfast
      photo (omelet/sausage/toast/orange): HTTP 200, 4 items, decodes exactly
      against `CaptureViewModel.AnalyzeResponse` + `DraftItem`. Only the
      UIKit downscale and on-device camera hardware remain unproven.
- [~] **StoreKit** — infrastructure DONE: `Loggi.storekit` config wired into
      the scheme (Xcode/device runs get local products) and real SKTestSession
      purchase/restore/expiry tests written. They SKIP on this machine: the
      iOS 26.5 simulator's StoreKit test daemon fails every op with Code=3.
      The tests will run on a healthy simulator or in Xcode; verify there.
- [ ] **Notifications** — Monday note + evening reminder actually delivering.
- [ ] **HealthKit** — reading a weigh-in from a scale, writing one back.

## Authenticated-session verification (needs a real login)

Checked by rendering only, not by a live round trip. NOTE: no Clerk auth can
COMPLETE in the simulator — `signInWithPassword` reaches the server and returns
but the SignIn status is `needsClientTrust` (Clerk's App Attest device
attestation), and App Attest needs a Secure Enclave the simulator lacks. Every
signed-in flow below therefore needs a real device, not just a login.

- [ ] **Email sign-in / sign-up** — screens + navigation VERIFIED (idb); the
      `signInWithPassword` call reaches Clerk and returns, but can't activate a
      session in the sim (needsClientTrust / App Attest). Device-only.
- [ ] **Onboarding finish** — goals + first weigh-in actually persist.
- [ ] **Ask Bevi** — a real question → a real reply over logged data.
- [ ] **Menu Scout** — a menu photo → dish ratings → reserve.
- [ ] **Meal save** — the optimistic path settling against the live API
      (unit-tested at the logic level; the network leg is unexercised).
- [ ] **Password reset** — the full Clerk email-code flow.
- [~] **Sign in with Apple** — native ASAuthorization via Clerk. VERIFIED in
      the simulator (idb-driven, 2026-07-21): tapping the button launches the
      real native Apple auth flow — the system "Sign in to your Apple Account"
      alert appears, which proves the entitlement + ASAuthorization wiring are
      correct. It can't COMPLETE in this sim (no Apple ID signed into it) — a
      setup step, not code. Before device: enable "Sign in with Apple" on the
      com.loggi.app App ID and configure the Apple provider in Clerk.
- [ ] **Sign in with Google** — Clerk OAuth browser flow; needs the Google
      provider configured in the Clerk dashboard.

## Verified this session (simulator + tests)

- [x] Every read screen (Today/History/Weight/Settings) renders in light,
      dark, and at AX5.
- [x] Onboarding and paywall render; paywall correctly shows its
      App-Store-unreachable fallback.
- [x] 10 `MealLogger`/`MealCache` unit tests pass (optimistic save, delete,
      totals, planned flag).
- [x] Palette regression tests pass; both validators agree at float precision.
- [x] Release configuration builds clean — DEBUG-only surfaces (gallery,
      preview seed) are genuinely excluded from a release build.

## Deferred (not built — smaller than they sound, but real)

- Questions/clarify step in the analyze flow (the model asks a
  disambiguating question; RN's `questions-step`).
- Meal edit/delete drawer from a journal row (delete exists via `MealLogger`;
  the drawer UI does not).
- Speak-to-log capture (`speak-capture` — Speech framework).
- Milestone share card (ImageRenderer; `MilestoneCard` exists unwired).

## Then, per the rewrite spec's Retirement step

After one clean TestFlight cycle on Swift: delete `apps/mobile`, the JS
toolchain, and the node_modules patches.
