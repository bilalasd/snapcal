# Screenshot loop — design

## Goal

A closed-loop dev workflow: Claude renders SnapCal's authed screens to PNGs
autonomously, reads them, edits real components, and re-renders — grounding
design work in pixels instead of reading JSX.

## Foundation (decided)

Real Clerk + real DB. Highest fidelity: real auth, real queries, real recharts.
Reusable as E2E tests later.

- **DB**: Neon dev branch. `DATABASE_URL` in `.env.local`.
- **Auth**: Clerk dev instance. `@clerk/testing` signs a test user in headlessly.
- **Driver**: Playwright (Chromium), mobile viewport 390×844 @2x.

## Credentials (user-provided, in `.env.local`)

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`,
`E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD`. Test user must exist in the
Clerk dev instance with email+password sign-in enabled.

## Components

1. **`scripts/seed-preview.ts`** — resolves the test user's Clerk id by email
   (Clerk backend SDK), then seeds via Drizzle so every screen has content:
   - `goals`: completed onboarding (`onboardedAt` set → no redirect), full
     profile, ~2100 kcal targets, goal weight.
   - `meals` + `mealItems`: ~10 days, 3 meals/day from a rotating menu; one
     favorite (drives Add screen's favorite chips).
   - `weights`: ~63 daily weigh-ins trending down (drives Weight chart, rate,
     TDEE verdict).
   - `weeklyRecaps`: last week (drives the recap card).
   - Idempotent: wipes this user's rows first. Photos omitted in v1 (remote
     image domains not configured) — meal items still render.

2. **`playwright.config.ts`** — loads `.env.local` via `process.loadEnvFile`,
   starts `npm run dev` if not already up (`reuseExistingServer`), Chromium,
   mobile viewport. Projects: `auth` (sign in, save storageState) → `screens`
   (authed shots) + `public` (signed-out sign-in/sign-up shots).

3. **`e2e/global-setup.ts`** — `clerkSetup()` (fetches the testing token).

4. **`e2e/auth.setup.ts`** — `setupClerkTestingToken` + `clerk.signIn` with the
   test user, saves session to `e2e/.clerk/user.json`.

5. **`e2e/screens.spec.ts`** — for each authed route, goto → wait for
   networkidle + settle (snap-in/charts) → full-page screenshot to
   `preview/<name>.png`. Routes: today, history, weight, add, settings,
   onboarding.

6. **`e2e/public.spec.ts`** — signed-out shots of sign-in, sign-up.

7. **package scripts**: `seed:preview`, `shots`.

## The loop

```
npm run seed:preview      # once per data change
npm run shots             # run → preview/*.png
# Claude reads preview/*.png → edits components → npm run shots → re-reads
```

## Non-goals (YAGNI)

Live AI analyze flow (seed the meal data instead), meal photos, empty/edge
states (v1 captures the data-rich states), CI wiring.

## Blast radius

New files only: `scripts/`, `e2e/`, `playwright.config.ts`, `preview/`
(gitignored). New devDeps: `@playwright/test`, `@clerk/testing`. No app runtime
code touched. Nothing runs in production.
