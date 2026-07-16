# Honesty Report — Design

**Date:** 2026-07-16
**Scope:** Sub-project 1 of the "standout round" (Honesty Report → Ask Bevi →
zero-second camera → dinner-out Live Activity → Menu Scout → milestone share
cards). Server math + one Monday-note section; no new screens.

## Goal

Every Monday, Bevi shows three numbers side by side and names the gap:

- **Logged** — average daily intake from the user's logs
- **Measured burn** — TDEE derived from the weight trend + logs (the number
  the smart goal already runs on)
- **Formula burn** — what a standard calculator would have guessed

One Bevi sentence explains the gap honestly: we can't split under-logged
portions from formula error, and it doesn't matter — the target comes from
the measured number, so the error never touches it.

This is the literal, visible version of the brand claim "the tracker that
admits it's estimating." Doctrine test: makes the numbers more honest (§7.1),
survives the user reading exactly how it works (§7.2), and Bevi would say it
to a friend (§7.3).

## Math

All over the same trailing 14-day window (`RATE_WINDOW_DAYS`) the smart goal
already uses:

- `avgIntakeKcal` — existing, from `computeEnergyBalance`
- `measuredTdeeKcal` — existing, `balance.tdeeKcal`
- `formulaTdeeKcal` — **new**: Mifflin-St Jeor BMR from the stored profile
  (`sex`, `age`, `heightCm`, latest trend weight) × activity multiplier
  (`activityLevel`: sedentary 1.2, light 1.375, moderate 1.55, active 1.725,
  very_active 1.9). One pure function in `packages/shared/src/trend.ts` (or a
  sibling module): `computeFormulaTdee(profile, weightKg): number | null` —
  null when any required field is missing.
- `driftKcal` — `formulaTdeeKcal − measuredTdeeKcal`, rounded to the nearest
  10 (false precision would violate the principle the feature exists to
  serve).

## Where it lives

- **Cron:** the existing weekly recap cron (`apps/api/src/app/api/cron/recap/route.ts`)
  computes the four numbers and stores them alongside the prose.
- **Storage:** new `stats` jsonb column on `weeklyRecaps`:
  `{ avgIntakeKcal, measuredTdeeKcal, formulaTdeeKcal, driftKcal }`.
  Null when guards fail. One Drizzle migration.
- **LLM prompt:** the recap prompt also receives the drift numbers so Bevi's
  prose can reference them, but **displayed figures render from `stats`,
  never from LLM text**.
- **API:** `GET /api/trends` already returns the latest recap
  (`apps/api/src/app/api/trends/route.ts`); include `stats` on that recap
  object, and extend the shared recap type in `packages/shared/src/types.ts`.

Zero additional AI cost; the weekly `stats` rows accumulate a drift history
for free if a chart is ever wanted later.

## UI

A section inside the existing Monday note card (`apps/mobile/components/monday-note-card.tsx`),
kicker **"THE AUDIT"**, following the editorial style in DESIGN.md:

- Three compact labeled figures in a row: *Logged* / *Your burn (measured)* /
  *Calculator's guess*.
- One Bevi line beneath, two states:
  - |drift| ≥ 100 kcal: "A calculator would've missed your burn by ~250
    kcal/day. Could be portions, could be the formula — either way, your
    target used the measured number."
  - |drift| < 100 kcal: "Your logs and your scale agree within 100 kcal.
    Tight bookkeeping."

DESIGN.md gets the new section documented in the same change (project rule).

## Guards

The section renders only when **all** hold; otherwise it's simply absent —
no nagging, no "complete your profile" upsell inside the note:

1. Existing verdict is not `collecting` (≥10 logged days, ≥4 weigh-ins,
   ≥14 days history — reuse `computeVerdict` thresholds).
2. `computeFormulaTdee` returns non-null (profile complete).
3. `computeEnergyBalance` returned non-null for the window.

## Not building (revisit later, not speculatively)

- Dedicated audit screen or drift-history chart.
- Any daily/inline drift display — verdicts hold still for a week (doctrine §3).
- Backfill of past weeks' `stats`.

## Testing

Unit tests beside `trend.test.ts`:

- `computeFormulaTdee`: known Mifflin-St Jeor vectors (male/female), each
  activity level, null on missing sex/age/height/activity.
- Drift assembly: agreement case (<100), large drift case, guard fall-through
  (collecting verdict → no stats; incomplete profile → no stats).
