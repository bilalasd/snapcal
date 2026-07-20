# Loggi native Swift rewrite — migration design

Date: 2026-07-19 · Branch: `swift-rewrite` · Status: **APPROVED 2026-07-20** (backend explicitly unchanged per Muhammad)

## Why (decision context)

Loggi is iPhone-only by decision, yet pays React Native's cross-platform tax
daily: three locally-maintained node_modules patches, Metro/Hermes/autolinking
failure classes (two multi-hour debugging sessions this week), an SDK
treadmill (3 majors behind after 2 weeks), and native wrappers over APIs
(HealthKit, SFSpeechRecognizer, AVFoundation, StoreKit) that Swift calls
directly. The widgets and App Intents targets are already Swift. A SwiftUI
rewrite removes the JS↔native seam — the source of nearly all
infrastructure pain — at the cost of a one-time rewrite of ~14 screens.

**The RN app stays shippable on `main` throughout.** The rewrite lives on
this branch until parity; whichever is healthier ships first to TestFlight.
The backend does not change at all.

## What does NOT change

- **The API** (`apps/api`, Next.js on Vercel): every endpoint, auth model,
  and payload stays identical. The Swift app is a new client of the same API.
- **Product behavior and design**: `PRODUCT.md` and `DESIGN.md` are the
  binding spec — tokens, type scale (11px floor), pastel blocks, motion
  (130ms ease-out), copy voice, and every screen's behavior. The rewrite is
  a re-implementation, not a redesign.
- **Bundle id `com.loggi.app`**, version/build numbering (`RELEASE.md`
  flow), App Store record: the Swift build ships as a normal update.
- Widgets (`LoggiWidgets`) and App Intents (`LoggiIntents`): already Swift —
  ported nearly as-is, finally without the bacons/prebuild machinery.

## Key technical decisions (recommendations locked unless you object)

| Decision | Choice | Why |
|---|---|---|
| UI framework | SwiftUI, Swift 6 | Modern default; matches existing widget code |
| iOS floor | **17.0** (up from 16.4) | Swift Charts maturity, `@Observable`, `DataScannerViewController` stability; your device fleet is fine |
| Project generation | **XcodeGen** (`project.yml`) | pbxproj merges are agent-hostile; generated projects keep diffs reviewable |
| Repo layout | new `apps/ios/` beside `apps/mobile` | Both apps coexist until retirement |
| Auth | Clerk iOS SDK (native, 1.3.x — researched 2026-07-20: mature, biweekly releases, prebuilt SwiftUI views, Apple/Google/passkeys) | Same Clerk instance/users, zero API changes. Exit strategy if Clerk ever bites: Sign in with Apple only + own sessions (documented in research, requires API auth rewrite — post-parity project) |
| Networking | URLSession + async/await + Codable | Zero dependencies; mirrors `@loggi/shared` types |
| Persistence (cache/queue) | SQLite via GRDB — or plain files if the queue stays simple | Match existing stale-while-revalidate + offline-queue semantics |
| Charts | Swift Charts | Replaces the hand-rolled RN charts |
| Barcode + camera | AVFoundation + Vision/`DataScannerViewController` | Replaces expo-camera; the lock-box UX per DESIGN.md |
| Speech | SFSpeechRecognizer direct | Replaces expo-speech-recognition (and its patch) |
| IAP | StoreKit 2 | Replaces `lib/purchases`; same product ids (`MONTHLY_SKU`/`YEARLY_SKU`) |
| Photos upload | URLSession upload to existing Blob endpoints | unchanged server contract |
| Crash reporting | Sentry-cocoa (native) | Same Sentry account, no sourcemap machinery |
| Dependencies budget | Clerk, GRDB, Sentry — **target ≤ 3 third-party pods/SPM packages** | The whole point of leaving RN |

## Phases (each ends runnable + demoable on the sim)

**Phase 0 — Skeleton + design system.** XcodeGen project, app target +
existing widget/intents targets wired in, theme (colors/typography/spacing
from DESIGN.md §tokens as Swift constants + Color assets light/dark), Bevi
asset port, deep-link URL scheme (`loggi://`) so the screenshot-loop workflow
(`docs/screenshots.md`) works from day one. Exit: app boots to a themed
placeholder; simctl deep links navigate.

**Phase 1 — Data layer.** Codable models mirroring `@loggi/shared`; API
client with Clerk token injection; Clerk sign-in/sign-up/reset screens (the
app's only blocking dependency on a third-party SDK — de-risk FIRST);
stale-while-revalidate cache + offline meal queue with the same semantics as
`lib/cache.ts` / `lib/queue.ts`. Exit: sign in on sim, fetch and print
today's meals.

**Phase 2 — Read surfaces.** Today (hero card, macros, streaks, milestones,
day paging), History (Swift Charts + day groups), Weight (trend chart,
verdict cards), Settings (all cards incl. goal/targets/profile forms, data
export via ShareLink, account deletion). Exit: daily-use parity for a
signed-in user who logs nothing.

**Phase 3 — Logging.** Camera capture + barcode lock box, photo analyze flow
(same `/api/analyze` contract), review/questions/nutrition-facts screens,
search + saved + quick log, speech capture (hold-to-talk dial included),
menu scout, time picker, planned meals. Exit: every logging path works
end-to-end against production API.

**Phase 4 — Growth surfaces.** Onboarding wizard + permission asks, paywall
on StoreKit 2 with restore + terms links, milestones share card
(ImageRenderer), Ask Bevi chat, Monday note + evening reminder (local
notifications), Apple Health sync (HealthKit direct). Exit: full feature
inventory below checks green.

**Phase 5 — Integration + hardening.** Widgets/App Intents retargeted to the
new app group data, screenshot parity sweep (light+dark) against the RN app,
compliance checklist (`docs/release/compliance-checklist.md`) full pass,
`RELEASE.md` adapted (xcodebuild archive stays; bump/check scripts lose the
RN-specific gates, gain SwiftLint/SwiftFormat equivalents). Exit: TestFlight
build of the Swift app through the existing release pipeline.

**Retirement.** After one clean TestFlight cycle on Swift: `apps/mobile`,
the JS toolchain, and the three node_modules patches are deleted in a single
celebratory commit. Memory notes updated.

## Feature parity inventory (the checklist Phase 5 audits)

Screens: Today · History · Weight · Settings · Add(camera/speak/search/
saved) · Review+Questions · Menu Scout · Ask Bevi · Onboarding · Paywall ·
Welcome/Sign-in/Sign-up/Reset. Behaviors: optimistic saves + undo toast ·
offline queue + banner · stale-while-revalidate caches · streak/on-target
badges · smart goal + Monday note · milestones + share · usual-meal
suggestion · pre-logged (planned) meals · data export JSON/CSV · account
deletion · haptics + reduce-motion + Dynamic Type + VoiceOver labels (HIG
work from 2026-07-19 carries over as requirements) · dark mode · widgets ·
App Intents/Shortcuts · Apple Health · evening reminder · barcode lookup ·
`loggi://` deep links.

## Risks and mitigations

- **Clerk iOS SDK maturity** — largely retired by 2026-07-20 research (SDK is
  1.3.x, actively maintained); Phase 1 still integrates auth first as the one
  third-party dependency.
- **Rewrite stalls before parity** — RN app remains shippable from `main`
  at all times; phases are ordered so each is independently demoable, and
  Phase 2 alone is a usable daily driver.
- **Scope creep** — DESIGN.md is binding; no redesigns during port. New
  ideas go to a post-parity list.
- **Agent workflow parity** — the simulator screenshot loop and deep links
  are Phase 0 deliverables, so the verify workflow that kept RN honest
  works for Swift from the first screen.

## Estimate

With agent-driven implementation at this session's pace: Phases 0–2 ≈ one
focused week; 3–4 ≈ two more; 5 ≈ a few days. Calendar time depends on your
review bandwidth. First Swift TestFlight realistically ~3–4 weeks out;
the RN app can ship to TestFlight this week regardless (recommended).

## Out of scope

- Android, web/PWA (unchanged decisions), API changes, visual redesign,
  Expo SDK 57 upgrade (parked as uncommitted changes in the main checkout —
  abandon or land independently; irrelevant to this branch).
