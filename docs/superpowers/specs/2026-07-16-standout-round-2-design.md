# Standout Round 2 — Spec + Plan

**Date:** 2026-07-16
**Scope:** Five features approved as a batch ("implement all"): Ask Bevi,
Menu Scout, zero-second camera (App Intents), dinner-out Live Activity,
milestone share cards. One combined doc instead of five spec/plan pairs —
a deliberate process deviation for velocity; each feature still ships as its
own commit(s). Working-tree rule from the Honesty Report applies: new files
are committed per feature; edits to files carrying uncommitted user WIP
(`index.tsx`, `add.tsx`, `weight.tsx`, `cache.ts`, `app.json`, `DESIGN.md`,
`package.json`) stay uncommitted and are disclosed.

---

## A. Ask Bevi — questions over your data + nutrition

Chat with Bevi about *your* logged data (protein average, why the target
moved, weekend patterns) plus general nutrition questions. Refuses medical
advice. Doctrine fit: makes the verdict clearer; honest about being an
estimate; Bevi voice.

- **API:** `POST /api/ask` (Clerk auth). Body `{ messages: [{role, content}] }`
  (client-held history, stateless server, no new tables). Server gathers the
  user's context — goals row, last 14 days of daily totals, trend rate,
  week-frozen verdict/goal/audit, latest recap — serializes it compactly, and
  calls Claude (`claude-opus-4-8`, the model the recap already uses; adaptive
  thinking, `effort: "low"`, `max_tokens: 1024`). System prompt = Bevi voice
  rules + data + boundaries (no diagnoses, no eating-disorder coaching, no
  guilt; defer to professionals). Guards: last 12 messages, 1,000 chars per
  message. Returns `{ reply }`.
- **Mobile:** modal route `app/ask-bevi.tsx` — editorial header ("CONTROL
  ROOM · ASK BEVI"), message list (user = black bubble right, Bevi = plain
  text with small Bevi avatar left), starter chips for the empty state
  ("How's my protein this week?", "Why did my target change?", "What should
  I eat out tonight?"), input bar. History lives in component state; closing
  the sheet keeps it for the session only.
- **Entry:** small "Ask Bevi" button on the Trends (weight) tab header.
- **Cost note:** each answer ≈ a recap call. Trial/pricing absorbs it;
  per-user rate caps are a fast follow if abuse shows up (needs storage —
  deliberately not built now).

## B. Menu Scout — point it at the menu, not just the plate

Photograph a restaurant menu; Bevi extracts dishes with estimated macros and
ranks them against what's left of today. Tap a dish → reserved as a planned
meal (existing `planned: true` path). Extends "one camera for anything
edible" to *before* the decision.

- **API:** `POST /api/menu` (Clerk auth). Body `{ image: {media_type, data},
  remaining_kcal, daily_goal_kcal }`. Same Gemini pipeline as `/api/analyze`
  (`generateObject` + AI Gateway, `google/gemini-3.5-flash`): schema returns
  `{ is_menu, dishes: [{name, portion_note, calories, protein_g, carbs_g,
  fat_g}] }` (max 20). Server adds `fit` per dish: `fits` (≤75% of
  remaining), `tight` (≤100%), `over`. Estimates are typical restaurant
  portions — the response carries an honesty line for the UI.
- **Mobile:** modal route `app/menu-scout.tsx` — capture via
  `expo-image-picker` camera (reusing `lib/image.ts` resize), dish list
  grouped fits/tight/over with block-color chips (mint/cream/coral), one
  assumption line ("Portions are my best guess from the menu"), tap →
  confirm → `POST /api/meals` with `planned: true, source: "menu"` → home.
- **Entry:** a "Menu" affordance on the add screen's mode row.

## C. Zero-second camera — App Intents

Own pocket-to-viewfinder time: Action Button, Spotlight, and Siri launch
straight into capture.

- **Target:** `apps/mobile/targets/app-intents/` via `@bacons/apple-targets`
  (`type: "app-intent"`, iOS 17): `LogMealIntent` (opens `loggi://add`) and
  `SpeakMealIntent` (opens `loggi://add?intent=speak` — the param the add
  screen already handles), exposed through an `AppShortcutsProvider` with
  natural phrases ("Log a meal with Loggi", "Tell Loggi what I ate").
  Intents open via `OpenURLIntent` (extension-safe). Action Button: user
  picks the shortcut in Settings — no extra code.

## D. Dinner-out Live Activity

When calories are reserved for later today, a Live Activity shows the
standing budget on the lock screen / Dynamic Island through the evening;
it ends when the meal is confirmed or the day rolls over.

- **Swift:** `DinnerActivityAttributes` (label; state: reservedKcal,
  remainingKcal) defined identically in the widget target and the bridge
  module (ActivityKit matches by type name + encoding). Lock-screen view:
  "DINNER OUT · ⟨label⟩" kicker, reserved figure, "N cal still available
  after". Dynamic Island: compact "N cal", expanded same as lock screen.
  iOS 16.2+ guards.
- **Bridge:** `WidgetBridgeModule` gains `startDinnerActivity(label,
  reserved, remaining)`, `updateDinnerActivity(reserved, remaining)`,
  `endDinnerActivity()` — one static Activity reference.
- **RN:** `lib/dinner-activity.ts` exports `syncDinnerActivity(todayMeals,
  goals)`; called from the same `lib/cache.ts` hook that syncs widgets, so
  reserve → activity appears, confirm/delete → it ends. No new UI.
- **Config:** `NSSupportsLiveActivities: true` in app.json.

## E. Milestone share cards

At warm milestones, Bevi offers a shareable card — building-themed, never
body-themed. No streak mechanics, nothing breakable (doctrine §5).

- **Milestones v1** (computed client-side in `lib/milestones.ts`, pure +
  unit-testable): `first-meal` (first logged meal), `week-logged` (7 logged
  days in the last 7), `first-working` (first Monday verdict "Working"),
  `month-of-weighins` (28+ days between first and last weigh-in in trends).
  Seen-set persisted in AsyncStorage; one card at a time, dismissible, never
  re-offered.
- **Card:** `components/milestone-card.tsx` — block-color card, kicker
  "BUILT WITH LOGGI", headline per milestone, Bevi `celebrate` pose,
  captured with `react-native-view-shot`, shared with `expo-sharing`
  (system share sheet; nothing auto-posts). Weight/body numbers never
  appear on cards.
- **Deps:** `react-native-view-shot`, `expo-sharing` (no native-free way to
  rasterize a view; both are the standard Expo pair).
- **Entry:** renders on Today under the Monday-note slot when a new
  milestone is detected.

## Testing & verification

- Shared/pure logic gets unit tests (`milestones.ts` in mobile has no test
  runner — its logic lives as a pure function; menu `fit` banding is
  computed server-side in the route and covered by typecheck + build).
- `yarn api build` (type-checked) after API work; `yarn mobile typecheck`
  after mobile work.
- Swift targets (App Intents, Live Activity) cannot be compiled in this
  environment — they follow the shipped widgets target's patterns and are
  flagged for verification on the next `expo prebuild` + device build.

## Not building (deliberate)

- Ask Bevi: streaming, server-side chat history, rate-cap storage.
- Menu Scout: auto-detecting menus inside the main analyze flow (kept as a
  separate explicit surface for v1 to avoid destabilizing the core logging
  path).
- Live Activity: push-updated activities (local updates only).
- Share cards: auto-posting, referral links, weight-change cards.
