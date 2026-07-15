# Loggi rename + Bevi the Beaver mascot — Design

Date: 2026-07-14
Status: Approved

## Goal

Rebrand the app from **Mealio** to **Loggi** (full rename) and introduce the
mascot **Bevi the Beaver** at key moments — without changing the app's flat
editorial design language or adding dependencies.

## Part 1: Full rename Mealio → Loggi

### Changes

- `apps/mobile/app.json`: `name: "Loggi"`, `slug: "loggi"`, `scheme: "loggi"`,
  `ios.bundleIdentifier: "com.loggi.app"`, `android.package: "com.loggi.app"`,
  permission strings reworded ("Loggi uses your photos to log meals." etc.).
- `apps/mobile/components/sso.tsx`: OAuth redirect scheme `mealio` → `loggi`.
- Monorepo package rename: `@mealio/shared` → `@loggi/shared`
  (`packages/shared/package.json` + all imports), root/app `package.json`
  names `mealio*` → `loggi*`.
- All user-visible copy containing "Mealio" → "Loggi" (onboarding, settings,
  auth screens, etc.).
- iOS native project regenerated: `npx expo prebuild -p ios --clean`
  (replaces `ios/Mealio.xcodeproj` with `Loggi`).

### Explicitly out of scope

- The deployed API URL `mealio-api-five.vercel.app` stays. Renaming the
  Vercel project is separate infra work, invisible to users.
- App icon / splash artwork.

### Manual follow-ups (user)

- Add `loggi://` as an allowed redirect in the Clerk dashboard — SSO breaks
  until this is done.
- Existing EAS/TestFlight builds are invalidated by the bundle ID change
  (accepted trade-off).

## Part 2: Bevi the Beaver at moments & empty states

### Assets

User supplies 3 generated PNGs (clipboard pose, standing arms-crossed pose,
forest scene). Processing: white background → transparent alpha, downscale to
~800px max dimension, save as `apps/mobile/assets/bevi/clipboard.png` and
`apps/mobile/assets/bevi/standing.png`. The forest-scene image is skipped —
it clashes with the flat cream aesthetic (keep for marketing later).

### Component

One `<Bevi pose="clipboard" | "standing" size={number} />` component
(`apps/mobile/components/bevi.tsx`) — a thin `Image` wrapper (~15 lines) with
a 130ms ease-out opacity fade on mount (matches existing animation style; no
springs).

### Placements

| Moment | Pose | Notes |
|---|---|---|
| Analyzing overlay (`analyzing-overlay.tsx`) | clipboard | Bevi "writes down" the meal during the AI wait — highest-value placement |
| Onboarding welcome step (`onboarding.tsx`) | clipboard | "Welcome to Loggi 👋" |
| Empty history / no meals today (`history.tsx`, `(tabs)/index.tsx`) | standing | Only where an empty state already exists |

Sizing: 120–180px, one appearance per screen, on the cream background.

### Deliberately excluded

- Persistent home-screen companion (reactive moods, nagging) — fights the
  "daily ledger, not gamified toy" voice.
- Bevi voice in copy — editorial tone stays deadpan.
- Lottie/Rive animation — no new dependencies; static PNG + fade is enough.

## Testing

- Rename: `grep -ri mealio` (excluding node_modules/ios) returns only the
  Vercel API URL; app builds and runs; SSO redirect uses `loggi://`.
- Mascot: visual check of the three placements in the simulator; empty states
  render without Bevi overflow on small screens.
