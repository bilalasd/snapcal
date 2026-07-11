# Mealio

Personal calorie tracker: snap photos of food (or describe it), Claude estimates
calories + macros, and your smart-scale weight trend (via Google Health) tells you whether your deficit is
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

### 4. Google Health API (for Fitbit weight sync)

The legacy Fitbit Web API is discontinued (sunsets Sept 2026); Fitbit data now
comes through the [Google Health API](https://developers.google.com/health).
For a personal app, run the OAuth client in **Testing** mode — no Google
review needed, but refresh tokens expire weekly (the app shows a one-tap
**Reconnect** button when that happens).

1. In [Google Cloud Console](https://console.cloud.google.com), create a
   project and enable the **Google Health API** (APIs & Services → Library).
2. APIs & Services → OAuth consent screen: user type **External**, publishing
   status **Testing**, and add your own Google account under **Audience →
   Test users**.
3. On the Health API **Data Access** page, add the scope
   `googlehealth.health_metrics_and_measurements.readonly`.
4. APIs & Services → Credentials → Create **OAuth client ID** (type: Web
   application) with authorized redirect URI
   `https://<your-app>.vercel.app/api/health/callback`
   (plus `http://localhost:3000/api/health/callback` for local dev).
5. Copy the client ID → `GOOGLE_HEALTH_CLIENT_ID` and secret →
   `GOOGLE_HEALTH_CLIENT_SECRET`.
6. Set `APP_BASE_URL` to the deployed URL (e.g. `https://snapcal-xyz.vercel.app`).

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
daily weight sync 06:30 UTC) — they authenticate with `CRON_SECRET`, which
Vercel sends automatically once set as an env var.

### 7. On your phone

Open the deployed URL in Safari/Chrome → Share → **Add to Home Screen**.
Log in once with your passcode; the session lasts 90 days.
In **Settings**, tap **Connect Google Health** once to link weight sync.

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

## How macros are calculated

Two separate things use the word "macros":

- **Your daily targets** (set in onboarding, editable in Settings). Protein is
  1.6 g per kg of bodyweight (enough to preserve muscle while active or in a
  deficit); fat is 30% of your calorie goal; carbs fill the remaining calories.
  Grams are shown as a percentage split of your calories (protein & carbs at
  4 kcal/g, fat at 9 kcal/g). Editing the percentages re-derives the grams, and
  changing your calorie goal keeps the same split.
- **A logged meal's macros** come from Claude's per-item vision/text estimate in
  `/api/analyze` — not from any formula. Each item also gets estimated saturated
  fat, fiber, sugar, and sodium for the Nutrition Facts panel. These are AI
  estimates, not lab-measured values.

## Loading the USDA food database

The app ships with a **foods** table (USDA FoodData Central whole ingredients,
per 100 g) powering the "Add from food database" search. To populate it:

- **Starter set (immediate):** once logged in, `POST /api/foods/seed` seeds ~150
  common staples via USDA's DEMO_KEY. Idempotent.
- **Full catalog:** get a free key at
  [fdc.nal.usda.gov/api-key-signup](https://fdc.nal.usda.gov/api-key-signup),
  then run `DATABASE_URL=... FDC_API_KEY=... npm run import-foods` to pull the
  full SR Legacy + Foundation datasets (~8,000 ingredients).

When you log a meal, matching your item name against this table lets you snap to
lab-measured nutrition instead of an AI estimate.
