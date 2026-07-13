# Shipping Mealio (Phases 6–7)

Everything below needs an account/login I can't do for you. The code and config are ready.

## 1. Deploy the API (`apps/api` → Vercel)

The mobile app talks to the existing Next.js API over HTTPS.

```bash
cd apps/api
npx vercel                # first run links/creates the project
npx vercel --prod         # production deploy
```

Set these env vars in the Vercel project (same values as `apps/api/.env.local`):
`DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `SESSION_SECRET`.

Note the production URL (e.g. `https://mealio-api.vercel.app`).

## 2. Point the app at the deployed API

- `apps/mobile/eas.json` → replace `REPLACE_WITH_YOUR_VERCEL_URL` in the
  `preview` and `production` profiles with the Vercel URL.
- For local sim dev, `apps/mobile/.env.local` keeps `http://localhost:3000`.

## 3. Build with EAS (native build — local CocoaPods hangs on this Mac, so use EAS cloud)

```bash
cd apps/mobile
npx eas login             # your Expo account
npx eas build:configure
npx eas build --profile preview --platform ios     # internal test build (TestFlight-installable)
# production:
npx eas build --profile production --platform ios
npx eas submit --profile production --platform ios  # needs an Apple Developer account ($99/yr)
```

Android is analogous with `--platform android` (needs a Google Play account for store submit;
internal APKs need no account).

## 4. Before store submit (not needed for internal testing)

- App icon + splash: add `assets/icon.png` (1024²) and `assets/splash.png`, wire them in
  `app.json` under `expo.icon` / `expo.splash`. Currently using Expo defaults.
- Clerk: swap the `pk_test_…` dev key for a `pk_live_…` production instance key in
  `eas.json` + Vercel, and add the production instance in the Clerk dashboard.

---

## Phase 6 — Health integration (deferred, not blocking)

The web app synced weight from Google Health via an OAuth web-redirect (`/api/health/*`).
On native this needs one of:

- **Google Health**: `expo-web-browser` `openAuthSessionAsync` + a `mealio://` deep-link
  callback, and the API's OAuth redirect URI updated to accept it. Moderate work.
- **Apple HealthKit** (iOS): `expo-health` / a HealthKit config plugin for native weight
  sync — a genuine native win, but requires a dev client (not Expo Go) to test.

The Weight screen already calls `POST /api/health/sync` opportunistically, so once a provider
is connected server-side it flows through with no app change. Manual weight logging works today.
