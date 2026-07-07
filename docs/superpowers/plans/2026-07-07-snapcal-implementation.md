# SnapCal — Implementation Plan

Spec: `../specs/2026-07-07-snapcal-design.md`

Each phase ends in a working, committed state.

## Phase 1 — Scaffold
- `create-next-app` (TypeScript, App Router, Tailwind v4) in repo root.
- shadcn/ui init + base components (button, card, input, drawer, tabs, chart…).
- PWA manifest + icons; bottom tab layout shell with the four screens stubbed.

## Phase 2 — Database & auth
- Drizzle ORM + schema per spec §4; migrations; Neon-ready `DATABASE_URL`.
- Passcode login page, signed httpOnly session cookie, middleware guard for
  app + API routes. `.env.example` documenting all env vars.

## Phase 3 — Analyze + meal CRUD
- `POST /api/analyze`: client-resized images (0–3) + optional text → Claude
  `claude-opus-4-8` with structured outputs (schema per spec §5).
- Meal endpoints: create, list by date/range, patch, delete, copy, favorite toggle.

## Phase 4 — Core screens
- Add meal: photo picker + resize, text + Web Speech mic, favorites chips,
  analyze → review card (edit numbers, ×½/×2, delete/add item) → save.
- Today: calorie ring, macro bars, streak, meal list.
- History: day list with totals, expand to meals, "log again", 7/30-day chart.
- Settings: goals, units, logout.

## Phase 5 — Fitbit + trends
- OAuth (PKCE, scope `weight`), token store/refresh, `GET /api/fitbit/sync`
  with 1-year backfill and hourly throttle + daily cron.
- Trend math module: EMA (α≈0.1/day), 14-day regression rate, measured TDEE,
  deficit verdict with warm-up gating (spec §8).
- Trends screen: weight chart (dots + trend), rate, maintenance, verdict card.

## Phase 6 — Weekly recap + tests
- `POST /api/recap` + Sunday cron (`CRON_SECRET`), recap card on Trends.
- Vitest unit tests: analyze-schema validation, portion scaling, totals,
  EMA/rate/TDEE/verdict math, token-refresh handling (mocked).

## Phase 7 — Polish & handoff
- README: Neon setup, Anthropic key, Fitbit app registration walkthrough,
  Vercel deploy + cron config.
- Verify full flow on phone; deploy to Vercel.
