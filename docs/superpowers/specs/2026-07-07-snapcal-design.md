# SnapCal — Design Spec

**Date:** 2026-07-07
**Status:** Approved pending user review
**Owner:** Bilal (single user)

## 1. Overview

SnapCal is a personal, single-user calorie tracker built as a mobile-first web app (PWA).
The user snaps 1–3 photos of food and/or types (or dictates) a description; Claude's
vision API estimates itemized foods with calories and macros; the user reviews, tweaks,
and saves. The app tracks daily intake against goals, pulls body weight from Fitbit,
computes a smoothed weight trend, and answers the core question: **"is my calorie
deficit actually working?"**

Primary usage is from a phone browser (added to home screen). Desktop works too.

## 2. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | Single codebase: UI + API routes |
| UI | Tailwind CSS + shadcn/ui, Recharts for charts, lucide icons | Mobile-first; shadcn charts (Recharts-based) for weight/calorie charts and the progress ring |
| Hosting | Vercel (free tier) | PWA manifest for home-screen install |
| Database | Neon Postgres (free tier) | Via Drizzle ORM |
| AI | Claude API, `claude-opus-4-8` | Vision + structured JSON outputs |
| Weight data | Fitbit Web API (OAuth 2.0) | Body Weight time series |
| Auth | Passcode + session cookie | Single user; protects data + API credits |
| Crons | Vercel cron | Weekly recap; optional daily Fitbit sync |

- Meal photos are **not stored**. They are resized client-side (~1024 px long edge,
  JPEG) to cut token cost, sent to the analyze endpoint, and discarded after analysis.
- Estimated running cost: Vercel free + Neon free + roughly $2–3/month of Claude API
  at ~3 analyzed meals/day (~2–3¢ per analysis) + 1 recap call/week.

### Environment variables

- `ANTHROPIC_API_KEY`
- `DATABASE_URL` (Neon)
- `APP_PASSCODE` (login)
- `SESSION_SECRET` (cookie signing)
- `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`
- `CRON_SECRET` (protects cron endpoints)

## 3. Auth

- `/login` page with a single passcode field, compared against `APP_PASSCODE`.
- On success, sets a signed, httpOnly session cookie (long-lived, e.g. 90 days).
- Middleware redirects all app routes and rejects all API routes without a valid
  session. Cron endpoints authenticate with `CRON_SECRET` instead.

## 4. Data model

```
meals
  id            uuid pk
  eaten_at      timestamptz        -- when the food was eaten (editable)
  name          text               -- AI-suggested, editable
  note          text null          -- user's optional text input
  is_favorite   boolean default false
  source        text               -- 'photo' | 'text' | 'favorite' | 'copy'
  created_at    timestamptz

meal_items
  id            uuid pk
  meal_id       uuid fk -> meals (cascade delete)
  name          text
  portion       text               -- human-readable, e.g. "1 cup cooked rice"
  calories      int
  protein_g     numeric
  carbs_g       numeric
  fat_g         numeric

goals                              -- single row
  daily_calories        int
  daily_protein_g       int
  daily_carbs_g         int
  daily_fat_g           int
  target_rate_kg_per_wk numeric    -- negative = lose, positive = gain
  unit_system           text       -- 'metric' | 'imperial'

weights                            -- cached from Fitbit
  date          date pk
  weight_kg     numeric
  source        text default 'fitbit'

fitbit_tokens                      -- single row
  access_token  text
  refresh_token text
  expires_at    timestamptz

weekly_recaps
  week_start    date pk
  content       text               -- markdown from Claude
  created_at    timestamptz
```

Daily totals are computed by summing `meal_items` grouped by `eaten_at::date` —
no denormalized totals table.

## 5. AI analysis

### Endpoint: `POST /api/analyze`

Input: 0–3 images (base64, client-resized) + optional text description. At least one
image or non-empty text is required.

Calls `claude-opus-4-8` with:

- The images and/or text as user content.
- A system prompt establishing the nutritionist-estimator role, portion-estimation
  guidance, and the user's optional text as ground truth that overrides visual guesses
  (e.g. "no butter" wins over what the photo suggests).
- **Structured outputs** (`output_config.format`, JSON schema) so the response always
  parses:

```json
{
  "meal_name": "string",
  "items": [
    {
      "name": "string",
      "portion": "string",
      "calories": "integer",
      "protein_g": "number",
      "carbs_g": "number",
      "fat_g": "number"
    }
  ]
}
```

Output: the parsed object, returned to the client for review. Nothing is written to
the DB by this endpoint.

### Error handling

- Claude refusal or API error → 502 with a user-friendly message; client shows a
  retry option. Input is preserved on the client so retry is one tap.
- Oversized images are prevented client-side by the resize step.
- Rate/cost abuse is prevented by auth (only the owner can call it).

## 6. Meal flow & endpoints

1. **Add screen** — camera/photo picker (up to 3), text field with a large mic button
   (Web Speech API dictation fills the text field; degrade gracefully to keyboard mic
   if unsupported), favorites chips at top.
2. **Analyze** → review card: editable numbers per item, ×½ / ×2 portion quick-buttons
   (scale all numeric fields of an item), delete item, add manual item, edit meal name
   and eaten-at time.
3. **Save** → `POST /api/meals` writes meal + items.

Other endpoints (all session-authed):

- `GET /api/meals?date=` / `GET /api/meals?from=&to=` — list with items.
- `PATCH /api/meals/:id` / `DELETE /api/meals/:id` — edit/delete (including
  toggling `is_favorite`).
- `POST /api/meals/:id/copy` — duplicate to today (`source: 'copy'`), returned for
  review before saving.
- Favorites logging is client-side trivial: `POST /api/meals` with the favorite's
  items and `source: 'favorite'`.

## 7. Fitbit integration

- User registers a free **Personal** app at dev.fitbit.com (one-time; README will
  contain step-by-step instructions). Redirect URL points at
  `/api/fitbit/callback`.
- **Connect flow:** Settings → "Connect Fitbit" → standard OAuth 2.0 authorization
  code grant with PKCE, scope `weight`. Tokens stored in `fitbit_tokens`; access
  token refreshed automatically via refresh token when expired. If refresh fails
  (revoked), Settings shows "Reconnect Fitbit".
- **Sync:** `GET /api/fitbit/sync` fetches the body-weight time series since the last
  cached date (initial backfill: 1 year) and upserts into `weights`. Triggered when
  the Trends screen loads (throttled to at most once per hour) and by a daily cron.
- Weights are stored in kg regardless of display units.

## 8. Weight trend & deficit analysis

Computed server-side by `GET /api/trends` from `weights` + meal totals:

- **Trend line:** exponential moving average (smoothing factor ~0.1/day, the
  TrendWeight/Happy Scale approach) over daily weights; gaps between weigh-ins are
  handled by applying the EMA per available data point.
- **Current rate:** linear regression slope of the trend value over the trailing
  14 days, expressed as kg/week (and lbs/week for imperial display).
- **Measured maintenance (TDEE):** over the trailing 14 days where food logging is
  complete: `TDEE ≈ avg daily intake − (Δtrend_weight_kg × 7700 / days)`.
  (Losing weight ⇒ Δ negative ⇒ TDEE above intake.)
- **Deficit verdict:** compares actual average deficit (`TDEE − avg intake`) with
  the deficit needed for `target_rate_kg_per_wk` (`rate × 7700 / 7`). Renders one of:
  - *On track* — within ±100 kcal/day of the needed deficit.
  - *Adjust* — "eat ~N kcal/day less (or more) to hit your target rate."
- **Warm-up / confidence gating:** the verdict requires ≥ 14 days of history with
  ≥ 10 logged days and ≥ 4 weigh-ins; otherwise the Trends screen shows
  "collecting data — verdict in ~N days". Days with zero logged meals are excluded
  from intake averages rather than counted as zero.

## 9. Screens

- **Today (home):** calorie progress ring + three macro bars vs goals; logging streak
  ("logged 6 of last 7 days"); today's meal list (tap to edit); prominent + button.
- **Add meal:** as in §6.
- **History:** day list with totals and goal hit/miss coloring; expandable to meals;
  "log again" action per meal; 7/30-day calories bar chart.
- **Trends:** weight chart (raw dots + trend line, 30/90-day toggle); current rate;
  measured maintenance calories; deficit verdict card; latest weekly recap card.
- **Settings:** goals (calories/macros + target rate), units, Connect Fitbit,
  logout.

Navigation: bottom tab bar (Today / History / Trends / Settings), floating + button.

## 10. Weekly AI recap

- Vercel cron, Sundays ~20:00 local, hits `POST /api/recap` (authed by `CRON_SECRET`).
- Sends the week's daily totals, logging streak, weight trend numbers, and goal to
  `claude-opus-4-8`; receives a short markdown recap (average intake, protein
  consistency, deficit vs goal, one concrete suggestion). Stored in `weekly_recaps`,
  displayed on Trends. Skipped (with a stored notice) if fewer than 4 logged days.

## 11. Testing

Lightweight, focused on the math and contracts:

- Unit tests: analyze-response schema validation, portion scaling, daily-total
  aggregation, EMA/trend/rate math, TDEE + verdict logic (including warm-up gating
  and gap handling), Fitbit token refresh handling (mocked).
- Everything UI is verified manually on a phone.

## 12. Out of scope (deliberate)

- Multi-user support, sign-up, roles.
- Photo storage / visual food diary (no Blob storage).
- Barcode scanning and food-database lookup (USDA etc.).
- Fitbit activity/steps calorie burn — measured TDEE from actual weight change is
  more accurate than device burn estimates.
- CSV export and push-notification reminders (declined for v1).
- Offline logging.

---

## Amendment (2026-07-07): Fitbit → Google Health API

Fitbit discontinued new app registrations and is sunsetting the legacy Web
API in September 2026. §7 is superseded: weight sync now uses the **Google
Health API** (Fitbit's successor) — standard Google OAuth 2.0 + PKCE, scope
`googlehealth.health_metrics_and_measurements.readonly`, data from
`health.googleapis.com` (weight in grams). The OAuth client runs in Google's
"Testing" mode (personal use, no review), which expires refresh tokens every
7 days — the Settings card surfaces a one-tap **Reconnect** state, tracked
via `health_tokens.needs_reconnect`. Routes moved from `/api/fitbit/*` to
`/api/health/*`; env vars are `GOOGLE_HEALTH_CLIENT_ID` / `_SECRET`.
Trend math, `weights` storage, and the deficit verdict are unchanged.

## Amendment 2 (2026-07-07): Guided onboarding replaces the calculator card

First launch now routes to `/onboarding` — a 6-step layman-friendly wizard
(units → sex/age → height/current weight → activity → goal & pace → plan).
It computes BMR/TDEE (Mifflin-St Jeor), the deficit for the chosen pace,
daily calories (safety-floored), and macro targets (protein 1.6 g/kg,
fat 30% kcal, carbs remainder); the entered weight is saved as the first
weigh-in (`POST /api/weights`, source `manual`). `goals.onboarded_at` gates
the redirect. Settings now has a unified **Goal** card — "Change goal" asks
*set manually* (drawer) or *redo the steps* (back to the wizard, prefilled) —
plus a dedicated Units card (metric/imperial, applied app-wide). The
standalone calculator card is removed.
