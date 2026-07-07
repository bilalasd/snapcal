# SnapCal

Personal calorie tracker: snap photos of food (or describe it), Claude estimates
calories + macros, and Fitbit weight data tells you whether your deficit is
actually working.

Single-user, passcode-protected, built with Next.js + Neon Postgres + the
Claude API. Designed to run free on Vercel (AI cost ≈ 2–3¢ per analyzed meal).

Docs: [design spec](docs/superpowers/specs/2026-07-07-snapcal-design.md) ·
[implementation plan](docs/superpowers/plans/2026-07-07-snapcal-implementation.md)

## Setup

### 1. Database (Neon — free)

1. Create a project at [console.neon.tech](https://console.neon.tech) (or add
   Neon via the Vercel Marketplace).
2. Copy the connection string → `DATABASE_URL`.
3. Apply the schema: `DATABASE_URL=... npm run db:migrate`

### 2. Anthropic API key

1. Create a key at [console.anthropic.com](https://console.anthropic.com) →
   `ANTHROPIC_API_KEY`.

### 3. App secrets

- `APP_PASSCODE` — whatever you'll type on the login screen.
- `SESSION_SECRET` — `openssl rand -hex 32`
- `CRON_SECRET` — `openssl rand -hex 32`

### 4. Fitbit app (for weight sync)

1. Go to [dev.fitbit.com/apps/new](https://dev.fitbit.com/apps/new) and register:
   - **Application type:** Personal
   - **Callback URL:** `https://<your-app>.vercel.app/api/fitbit/callback`
     (plus `http://localhost:3000/api/fitbit/callback` for local dev)
   - Everything else can be placeholder text/URLs.
2. Copy **Client ID** → `FITBIT_CLIENT_ID`, **Client Secret** → `FITBIT_CLIENT_SECRET`.
3. Set `APP_BASE_URL` to the deployed URL (e.g. `https://snapcal-xyz.vercel.app`).

### 5. Run locally

```bash
cp .env.example .env.local   # fill in the values above
npm install
npm run dev                  # http://localhost:3000
```

### 6. Deploy to Vercel

```bash
npx vercel deploy --prod
```

Then in the Vercel project settings add all env vars from `.env.example`.
`vercel.json` already schedules two crons (weekly recap Sunday 20:00 UTC,
daily Fitbit sync 06:30 UTC) — they authenticate with `CRON_SECRET`, which
Vercel sends automatically once set as an env var.

### 7. On your phone

Open the deployed URL in Safari/Chrome → Share → **Add to Home Screen**.
Log in once with your passcode; the session lasts 90 days.
In **Settings**, tap **Connect Fitbit** once to link weight sync.

## How the deficit verdict works

Raw weigh-ins are smoothed with an exponential moving average (TrendWeight-style).
Your *measured* maintenance calories = average logged intake + the energy
equivalent of your actual trend-weight change (7,700 kcal/kg). Comparing that
against your target rate (Settings → Weight goal) yields the verdict on the
Trends screen. It needs ~2 weeks of consistent logging (≥10 logged days,
≥4 weigh-ins) before it will commit to an answer.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (trend math, analysis schema) |
| `npm run db:generate` | Generate migration from schema changes |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
