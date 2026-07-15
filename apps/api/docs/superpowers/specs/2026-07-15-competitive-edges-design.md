# Loggi — Competitive Edges

**Date:** 2026-07-15
**Status:** Approved
**Context:** Market research showed the open lane is "Cal AI speed with MacroFactor
brains" plus trust. Adaptive goals already exist; this round ships the remaining
four edges, each at minimum viable size.

## 1. Repeat-meal suggestions ("Your usual")

- Pure function `pickUsual(meals, now, tzOffsetMin)` in `@loggi/shared` (`usual.ts`):
  groups the last 45 days of meals by `lower(trim(name))` within the current
  time-of-day bucket (morning 4–11, midday 11–16, evening 16–22, night otherwise,
  local time). A group with ≥3 occurrences whose name isn't already logged today
  wins; ties break by most-recent. Returns the winning group's most recent meal id.
- `GET /api/meals/suggestions?tz_offset=` — fetches 45 days of meal headers, runs
  `pickUsual`, returns the full meal (items + photos) or `{ meal: null }`.
- Today screen: dismissible card between the calorie card and the meal journal,
  only on today. **Log it** creates an optimistic copy (`source: 'copy'`,
  `eaten_at: now`) via the same path as quick-log; ✕ hides suggestions for the
  rest of the day (module-level flag, resets on app restart — good enough).
- Endpoint failure or no suggestion → card silently absent.

## 2. Honest estimates

- `analyzedItemSchema` gains `confidence: "low" | "medium" | "high"`; prompt
  tells the model to be honest about identity/portion certainty. `DraftItem`
  carries it optionally; USDA grounding passes it through untouched.
- Review screen: low-confidence items show their portion in amber with a
  help icon; a meal-level Bevi note appears when any item is low: portions are
  guesses, worth a check. Correction stays the existing ×½/×2 + portion editing.
- **Deviation from the approved sketch:** no new DB columns. `portion` +
  `estimated_grams` already express the assumption, and confidence only matters
  at review time — once the user confirms, storing it would be stale. The
  tap-to-cycle chip was dropped as redundant with the existing ×½/×2 buttons.

## 3. Trust & privacy

- **Deviation:** the original "photos are never stored" claim is no longer true —
  meal photos are uploaded to Blob and attached to the journal. Copy is reframed
  to what IS true: your data is private to your account, export or delete anytime.
- `GET /api/account/export` — one JSON of goals, meals (items + photo URLs),
  weights, and weekly recaps.
- Onboarding: a "privacy" step after units — data is yours, export/delete anytime.
- Settings: Account card becomes "Your data" — Export my data (share sheet),
  log out, delete account.

## 4. Bevi voice + moments

- Low-confidence note and analysis-failure alerts rewritten in Bevi's voice
  (warm, brief, never guilt).
- Welcome-back moment: today's empty state after 3+ days without logs switches
  to a gentle "no catch-up needed" message. No new animation (fast fades only).

## Testing

- `usual.test.ts`: bucketing edges (bucket boundaries, tz offset, <3 occurrences,
  already-logged-today exclusion, tie-break).
- Confidence flows through existing analyze/review paths — verified by running
  the app; no ranges ever appear in totals or charts.
