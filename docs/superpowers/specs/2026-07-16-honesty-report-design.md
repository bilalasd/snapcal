# Honesty Report — Design

**Date:** 2026-07-16 (v2 — verification pass removed the cron/storage design;
see "Why read-time" below)
**Scope:** Sub-project 1 of the "standout round" (Honesty Report → Ask Bevi →
zero-second camera → dinner-out Live Activity → Menu Scout → milestone share
cards). One shared pure function, one API field, one Monday-note section. No
migration, no cron changes, no LLM involvement.

## Goal

Every Monday, Bevi shows three numbers side by side and names the gap:

- **Logged** — average daily intake from the user's logs
- **Your burn (measured)** — TDEE derived from the weight trend + logs (the
  number the smart goal runs on)
- **Calculator's guess** — what a standard formula would have said

One canned Bevi sentence explains the gap honestly: we can't split
under-logged portions from formula error, and it doesn't matter — the target
comes from the measured number, so the error never touches it.

This is the literal, visible version of the brand claim "the tracker that
admits it's estimating." Doctrine test: makes the numbers more honest (§7.1),
survives the user reading exactly how it works (§7.2), and Bevi would say it
to a friend (§7.3).

## Why read-time (v2 change)

v1 had the weekly recap cron compute and store the stats. Verification found
that design broken twice over:

1. The cron fetches only 7 days of meals, so `computeVerdict`'s ≥10
   logged-days threshold can never pass there — the guard would hide the
   section for every user, always.
2. The cron buckets meals by UTC day; the adaptive goal buckets by the
   client's timezone and freezes at the local Monday. Stored stats would
   routinely disagree with the target the user actually got — false precision
   in the one feature about honesty.

`/api/trends` already computes `weekBalance` — the week-frozen energy balance
that produces `adaptive_goal_kcal`. The audit reads those exact values, so
"your target used the measured number" is the same computation, not a claim.

## Math

All from the week-frozen window `/api/trends` already builds
(`trendAsOfWeek` + client-tz intake):

- `avgIntakeKcal` — `weekBalance.avgIntakeKcal` (existing)
- `measuredTdeeKcal` — `weekBalance.tdeeKcal` (existing)
- `formulaTdeeKcal` — **new**: Mifflin-St Jeor BMR from the stored profile
  (`sex`, `age`, `heightCm`) and the last `trendAsOfWeek` point's `trendKg`
  (the same weight basis the goal used), × activity multiplier
  (`activityLevel`: sedentary 1.2, light 1.375, moderate 1.55, active 1.725,
  very_active 1.9). Pure function in `packages/shared`:
  `computeFormulaTdee(profile, weightKg): number | null` — null when any
  required field is missing or weight ≤ 0.
- `driftKcal` — `formulaTdeeKcal − measuredTdeeKcal`, rounded to the nearest
  10 (finer would be false precision; the goal itself rounds to 50).

A tiny pure helper `computeAuditStats(weekBalance, formulaTdeeKcal)` returns
`{ avgIntakeKcal, measuredTdeeKcal, formulaTdeeKcal, driftKcal }` so the
route stays thin and the math stays unit-testable.

## Where it lives

- **API:** `GET /api/trends` (`apps/api/src/app/api/trends/route.ts`) gains
  an `audit` field — the stats object, or null when guards fail. Computed
  from `weekBalance`; frozen per calendar week for the same reason the goal
  is. Shared response type extended in `packages/shared/src/types.ts`.
- **Mobile:** a section inside the existing Monday note card
  (`apps/mobile/components/monday-note-card.tsx`) rendering from the trends
  payload. The recap prose is untouched; the audit's Bevi lines are canned
  strings in the component, so prose and figures can never contradict.
- **Not stored:** no `stats` column, no drift history. If a drift chart is
  ever wanted, that's its own future spec.

Zero AI cost, zero migrations.

## UI

Kicker **"THE AUDIT"**, following the editorial style in DESIGN.md:

- Three compact labeled figures in a row: *Logged* / *Your burn (measured)* /
  *Calculator's guess*.
- One canned Bevi line beneath, keyed on |drift|:
  - ≥ 100 kcal: "A calculator would've missed your burn by ~250 kcal/day.
    Could be portions, could be the formula — either way, your target used
    the measured number."
  - < 100 kcal: "Your logs and your scale agree within 100 kcal. Tight
    bookkeeping."

DESIGN.md gets the new section documented in the same change (project rule).

## Guards

The `audit` field is null — and the section absent, no nagging, no
"complete your profile" upsell — unless **all** hold:

1. `weekVerdict.status !== "collecting"` (≥10 logged days, ≥4 weigh-ins,
   ≥14 days history — the thresholds the goal already enforces).
2. `computeFormulaTdee` returns non-null (profile complete).
3. `weekBalance` is non-null.
4. `goalsRow.adaptiveGoal` is true — the punchline "your target used the
   measured number" must be literally true. Users on a static goal simply
   don't see the section (a persuasion variant for them is deliberately not
   built — that's an upsell inside the note).

## Not building (revisit later, not speculatively)

- Dedicated audit screen or drift-history chart/storage.
- Any daily/inline drift display — verdicts hold still for a week
  (doctrine §3).
- LLM prose about drift — canned lines are exact, free, and can't contradict
  the figures.
- An audit variant for static-goal users.

## Testing

Unit tests in `packages/shared` beside `trend.test.ts`:

- `computeFormulaTdee`: known Mifflin-St Jeor vectors (male/female), each
  activity level, null on missing sex/age/height/activity, null on
  weight ≤ 0.
- `computeAuditStats`: agreement case (<100), large drift case, rounding to
  nearest 10, sign convention (formula above measured → positive drift).
