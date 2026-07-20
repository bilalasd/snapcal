# Shipping Loggi (Phases 6–7)

Everything below needs an account/login I can't do for you. The code and config are ready.

## 1. Deploy the API (`apps/api` → Vercel) ✅ DONE

Deployed: **https://mealio-api-five.vercel.app** (project `mealio-api`).

How it was done (monorepo notes, for redeploys):
- Project `rootDirectory` is set to `apps/api` (Vercel installs the whole Yarn
  workspace and builds the app — a plain `apps/api`-only upload can't resolve
  `@loggi/shared`, and a local `--prebuilt` deploy fails on hoisted
  `node_modules`). Deploy from the **repo root**: `npx vercel deploy --prod`.
- Env vars already set (production): `DATABASE_URL`, `CLERK_SECRET_KEY`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`,
  `SESSION_SECRET`, `APP_BASE_URL`.

> ⚠️ **`ANTHROPIC_API_KEY` is NOT set** — photo analysis (`/api/analyze`) will
> 500 until you add it: `printf 'sk-ant-...' | npx vercel env add ANTHROPIC_API_KEY production`
> then redeploy. Everything else (meals, weights, trends, auth) works now.

## 2. Point the app at the deployed API ✅ DONE

- `apps/mobile/eas.json` preview/production → `https://mealio-api-five.vercel.app`.
- `apps/mobile/.env.local` also points at the deployed URL, so the sim/Expo Go
  hit production (no local API tab needed). Change back to `http://localhost:3000`
  if you want to develop against a local API.

## 3. Build & release ✅ PROCESS EXISTS — see RELEASE.md

Local Xcode builds are the path (verified 2026-07-19: `pod install` +
`xcodebuild archive` succeed on this Mac — the old "local CocoaPods hangs"
note is stale). The full beta/production runbook with versioning, release
notes, and compliance gates lives in **RELEASE.md**. Quick reference:

```bash
cd apps/mobile
./scripts/release-check.sh   # gates
./scripts/bump-build.sh      # version + tag
./scripts/archive.sh         # build/Loggi.xcarchive (+ env verification)
# then Xcode → Organizer → Distribute App
```

EAS remains a fallback only (see RELEASE.md §fallback).

## 4. Before store submit (not needed for internal testing)

- App icon + splash: add `assets/icon.png` (1024²) and `assets/splash.png`, wire them in
  `app.json` under `expo.icon` / `expo.splash`. Currently using Expo defaults.
- Clerk: swap the `pk_test_…` dev key for a `pk_live_…` production instance key in
  `eas.json` + Vercel, and add the production instance in the Clerk dashboard.

---

## Phase 6 — Health integration (Apple Health, done in code)

Weight syncs from **Apple Health** on-device: `apps/mobile/lib/apple-health.ts` reads new
bodyMass samples via a HealthKit anchored query and POSTs them to `/api/weights` (upsert
by date). Connect/disconnect lives in Settings; sync fires on Weight-tab focus. Needs a
dev client — HealthKit doesn't exist in Expo Go, so build with
`eas build --profile development --platform ios` (simulator build, no Apple account needed)
and test by adding a weight in the sim's Health app.

Google Health was removed (2026-07-15): on iOS every scale ecosystem already lands in
Apple Health, the mobile app never had a connect flow for it, and Google's sensitive-scope
OAuth verification isn't worth it for a fallback. If Android ships someday, mirror the
HealthKit approach with on-device Health Connect (`react-native-health-connect`) — don't
resurrect the cloud API. The `health_tokens` table is orphaned in the DB; drop it whenever:
`DROP TABLE health_tokens;`. The `GOOGLE_HEALTH_CLIENT_ID/SECRET` Vercel env vars are unused.
