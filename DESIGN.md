# Loggi — Design Specification

> **Source of truth: the shipped mobile app.** This document describes what the
> app actually looks like (`apps/mobile` — Expo/React Native, NativeWind).
> Values are pulled from `apps/mobile/global.css`, `tailwind.config.js`, and the
> live components. **Any design change in the app must be reflected here in the
> same change.** Product doctrine and voice live in [PRODUCT.md](PRODUCT.md).

---

## 1. App concept

**Loggi** is a mobile calorie & weight tracker. You photograph a meal (or speak,
scan, search), Bevi the Beaver's AI reads the plate and estimates nutrition, you
confirm, and the app tracks intake against an adaptive target derived from your
smoothed weight trend.

- **Platform:** Native iOS/Android via Expo (React Native + NativeWind),
  portrait, tabs + modals.
- **Audience:** People cutting or maintaining weight who want low-friction,
  photo-first logging with honest, measured feedback.
- **Voice:** Editorial, confident, plainspoken — a "daily ledger," not a
  gamified toy. Section labels read like a newspaper desk ("TREND DESK",
  "CONTROL ROOM", "PLATE INDEX", "ARCHIVE"). Bevi is the warm voice inside the
  confident layout (see PRODUCT.md §4).
- **Tone words:** stark, warm, editorial, decisive, trustworthy.

### 1.1 Interaction principles

- **Very low friction.** Every core action (log a meal, weigh in, check today)
  is reachable in one or two taps from anywhere. Never add a step, screen, or
  confirmation that isn't strictly earning its keep — friction is the #1
  churn driver in food logging.
- **Encouraging and warm.** The app roots for the user. Feedback celebrates
  what they did ("logged", "streak kept") and never scolds what they didn't.
  Empty states invite, errors reassure, Bevi cheers — warmth in copy and
  motion, not confetti spam.
- **Gesture-encouraged, never gesture-required.** Gestures are the fast lane
  (drag the speed dial, swipe between days), but every gesture has a visible
  tap equivalent. A user who never discovers a single gesture can still do
  everything.
- **No learning curve.** Zero tutorials, coach marks, or invented interaction
  patterns. If a screen needs explaining, redesign the screen. First-time use
  should feel like the second time.

---

## 2. Design theme

> **Theme prompt:** "Stark black-and-white editorial layout with one loud
> vermilion accent. Heavy black display type, tightly tracked, uppercase kickers.
> Flat white cards with hairline borders and generously rounded corners. Soft
> pastel 'block' tiles for meal-type glyphs. No gradients, no glassmorphism,
> no shadows — contrast does the work."

### 2.1 Art direction
- **Flat + stark**, not material or skeuomorphic. No gradients, no drop
  shadows; hierarchy comes from type weight, size, and hairline borders.
- **Accent discipline:** vermilion `#e64a19` (`accent-log`) is reserved for the
  logging entry points — the floating "+" button and its speed-dial actions. It
  is the "log something" color; it never decorates.
- **Pastel blocks:** meal-type and category glyphs sit on soft pastel tiles
  (`block-*` tokens) with near-black ink — the one place color is playful.
- **Bevi:** transparent-PNG mascot poses (`assets/bevi/`: standing, wave,
  clipboard, camera, scale, promise, celebrate), one appearance per screen max,
  at moments that matter (PRODUCT.md §4). Bevi never sits on or in front of an
  accent-log surface — poses go on neutral or pastel grounds only; the accent
  is the same warm family as the fur, and layering them smears both.

### 2.2 Color palette

Semantic tokens are RGB-triplet CSS variables in `apps/mobile/global.css`,
wrapped as `rgb(var(--x) / <alpha-value>)` in `tailwind.config.js` so opacity
modifiers work. Components never hardcode hex; non-className color props
(icons, spinners, placeholders) use the `useColors()` hook in `lib/colors.ts`.

**Light (default)**

| Role | Token | Hex | Use |
|---|---|---|---|
| Background | `--background` | `#ffffff` | App canvas |
| Foreground | `--foreground` | `#000000` | Primary text |
| Card | `--card` | `#ffffff` | Card surfaces (hairline-bordered) |
| Primary | `--primary` | `#000000` | Filled buttons, selected segments |
| Primary foreground | `--primary-foreground` | `#ffffff` | Text on primary |
| Primary (strong) | `--primary-strong` | `#000000` | Emphasis text |
| Muted | `--muted` | `#f7f7f5` | Input/track/skeleton surfaces |
| Muted foreground | `--muted-foreground` | `#565656` | Kickers, secondary text |
| Accent | `--accent` | `#f1f1f1` | Quiet fills |
| Destructive | `--destructive` | `#d92d20` | Errors, over-target, delete |
| Border | `--border` | `#e6e6e6` | Hairlines, input borders |
| Accent | `accent-log` (static) | `#e64a19` | Logging entry points ("+" FAB, speed dial), capture-state dots, streak badge |

**Dark** (authored independently, not inverted; near-black base avoids OLED smear)

| Role | Hex | Contrast on base |
|---|---|---|
| Background | `#0c0c0c` | — |
| Foreground | `#f5f5f5` | 17.9:1 |
| Card | `#161616` | — |
| Primary / on-primary | `#f5f5f5` / `#0c0c0c` | 17.9:1 |
| Primary (strong) | `#ffffff` | — |
| Muted / Muted foreground | `#1c1c1a` / `#a3a3a3` | 7.8:1 |
| Accent | `#222222` | — |
| Destructive | `#f97066` (lightened) | 7.0:1 |
| Border | `#2a2a2a` | — |
| Accent | `#e64a19` (shared) | 5.0:1 |

**Block pastels** (static, both themes): lime `#dceeb1`, lilac `#c5b0f4`,
cream `#f4ecd6`, mint `#c8e6cd`, coral `#f3c9b6`, navy `#1f1d3d`, ink `#000000`.
Text on pastel tiles is fixed near-black ink, never the themed foreground.
Block-colored **cards** apply the pastel via inline `style` from
`lib/colors.ts` `block` — stacking a second `bg-*` class on `Card` loses the
class conflict against `bg-card`.

**Chart ramp** (light): black `#000000` primary series, grays
`#6b6b6b/#3d3d3d/#9a9a9a/#1f1f1f` secondary; destructive red for over-target.
Dark mode requires the mirrored light-on-dark ramp.

**Contrast rules (WCAG AA):** text ≥4.5:1, secondary text ≥3:1, chart
geometry ≥3:1 — verified light **and** dark independently. The accent passes
as a UI color in both (3.9:1 light, 5.0:1 dark) but is not body-text; text on
an accent fill uses shade 600 `#b83a14` (5.8:1 on white).

**Theme switching:** follows the system (`userInterfaceStyle: "automatic"`);
tokens flip via `prefers-color-scheme` in `global.css`. No in-app toggle.

### 2.3 Typography
- **System font** (SF Pro on iOS) — no custom font loading. Weight and
  tracking do the editorial work.
- **Tabular figures** on data (calories, macros, weights) to prevent shift.

| Style | Spec (NativeWind) | Role |
|---|---|---|
| Headline | `text-4xl font-black tracking-tighter` | Screen titles ("Weight", "Settings") |
| Big metric | `text-6xl font-black tracking-tighter` tabular | "1,875 CAL LEFT" |
| Kicker | `text-xs font-extrabold uppercase tracking-[2px] text-muted-foreground` | Desk eyebrows ("TREND DESK") |
| Body | 16px regular–semibold, lh 1.5 | Paragraphs, list content |
| Label | 12–14px medium–bold | Field labels, macro readouts |
| Tab label | 10px `font-extrabold` uppercase | Bottom tab bar |

### 2.4 Spacing & layout
- **Grid:** 4/8px rhythm; card padding 16px; section gaps 16/20/24px.
- Screens are edge-to-edge with 16px gutters; safe-area insets respected top
  and bottom; scroll content reserves bottom inset above the floating "+".

### 2.5 Shape & radius
- **Rounded, not pill-everything:** cards `rounded-3xl`, inputs and rows
  `rounded-2xl`, chips/segments and the FAB family `rounded-full`.

### 2.6 Elevation & effects
- **None.** Flat surfaces + `1px` hairline borders (`border-border`).
  Overlays use a plain black scrim: sheets `bg-black/40`, speed-dial backdrop
  `bg-black/30`.

### 2.7 Iconography
- **Feather** (`@expo/vector-icons`), one family, default stroke. Sizes 16
  (inline), 18–24 (feature), tab icons `size-2`. No emoji as structural icons.
- Icon-only buttons carry `accessibilityLabel`; icon `color` comes from
  `useColors()`.

### 2.8 Motion

Doctrine (PRODUCT.md §4 "snappy but fluid"):
- **~130ms, `Easing.out(cubic|quad)`** for everything: press scale
  (`PressableScale`), speed-dial fan-out, Bevi `FadeIn`, tab cross-fade
  (`animation: "shift"`), list item entrances.
- **No springs, no bounce, no decorative motion.** Exit ≤ enter.
- Screen pushes: native `simple_push` at 200ms; scene background themed so
  transitions never flash white in dark.
- **Launch:** native splash is held until auth state is known, then
  cross-fades into the first screen (200ms, `expo-splash-screen` native fade;
  reduced motion hides it instantly). No hard cut, no custom splash overlay.
- **Reduced motion:** durations drop to 0 via `useReducedMotion()` — required
  on every animation, not just the tab bar.
- Exception: determinate progress (barcode hold-ring) may use linear easing.
- **Determinate fills animate to data changes:** the progress ring arc and
  macro fill bars ease to new values (130ms, `Easing.out(quad)`) instead of
  snapping; they initialize at the current value so mounting never plays a
  decorative sweep. Reduced motion sets them instantly.

### 2.9 App icon
Bevi's face, close-cropped bust (from the `standing` pose: direct gaze,
closed smile, crossed arms at the bottom edge, tail hint at right), on a
full-bleed lime block (`#dceeb1`, the Today-hero/widget color). No accent —
`#e64a19` stays reserved for in-app logging entry points (§2.1) and never
decorates the icon. No type, no gradients, no shadows outside the artwork
itself. Sources: `assets/icon.png` (1024, tight face crop) and
`assets/adaptive-icon.png` (same composition framed wider so the head clears
Android's ~66% circular safe zone; lime `backgroundColor` in `app.json`
makes every mask shape seamless).

---

## 3. Component inventory

| Component | Description | States |
|---|---|---|
| **Tab bar** | Fixed bottom, 4 destinations (Today, History, Weight, Settings) + empty center slot. 10px uppercase labels + Feather icons. | active / inactive |
| **Speed dial ("+")** | 76px vermilion FAB seated in the bar's center socket. Tap or touch-down fans out 4 actions (Search, Camera, Speak, Saved) at 130ms; drag-to-select pie-menu style with haptics; tap-away scrim closes. Every action also plain-tappable. | closed / open / action-hover |
| **Card** | Flat `bg-card`, hairline border, `rounded-3xl`, 16px padding. | — |
| **Block tile** | Pastel `block-*` square, `rounded-2xl`, near-black Feather glyph. Meal-type/time glyphs. | — |
| **Kicker + Headline** | Desk eyebrow + heavy title, the screen-top signature. | — |
| **Metric block** | Oversized tabular number + kicker + sublabel. | normal / over-target (destructive) |
| **Progress ring** | Circular % logged. Fixed-ink arc/labels on a black/12 track — it lives on the lime block card, so it never uses themed tokens. | 0–100% |
| **Macro rows** | PROTEIN / CARBS / FAT label + fill bar + `0/138g · 0%` readout. | — |
| **Meal list item** | Photo or block-tile glyph, time kicker, name, macros, right-aligned CAL figure. Pre-logged meals swap the time for "PLANNED · TAP TO CONFIRM". Long-press (fast lane) opens a quick menu — Log again / Delete — every action also reachable via the drawer. | tap → meal drawer / long-press → quick menu / planned |
| **Monday note card** | Lilac block card on Today: "TREND DESK · week of ⟨date⟩" kicker, "Bevi's Monday note" title, verdict chip (Working / Adjust / Still collecting), "New target: N — was M" line when the smart goal moved, recap prose. "THE AUDIT" section when the smart goal is on and the week has enough data: three figures (Logged / Your burn, measured / Calculator's guess) over one canned Bevi line — drift ≥100 cal names the gap ("could be portions, could be the formula — either way, your target used the measured number"), <100 cal says "Tight bookkeeping." Dismiss hides it for the week (persisted). First show offers the weekly local notification (Bevi wave + Notify me / No thanks); the offer never repeats. | working / adjust / collecting / dismissed / audited |
| **Bar chart** | Calories/day, dashed goal line, y-axis scale, destructive over-target bars. | loading / empty |
| **Weight chart** | Measured dots + trend line + axis labels + inline legend, 30d/90d. | collecting / trending |
| **Meal review** | Items collapse to summary rows; tap to expand number grid (progressive disclosure); low-confidence items marked with help glyph + assumption text + one-tap ×½/×2; editing clears the guess mark. | collapsed / expanded / saving |
| **Question card** | Clarifying question + tappable answer chips + free-text "Send" fallback; skippable. | with/without choices |
| **Analyzing overlay** | Full-screen: photo (or Bevi camera pose), pulsing glow + ticking status checklist. Honors reduced motion (pulse freezes, checklist still ticks). | — |
| **Sheet / drawer** | Bottom sheet over `bg-black/40` scrim; drag or tap-away or explicit close. | — |
| **Undo toast** | Floating dark pill above the FAB, 5s: "Deleted ⟨meal⟩ · UNDO". Deletes are instant (no confirm dialog); the DELETE request only fires after the toast expires, so undo is a pure cache restore. | visible / expired |
| **Time picker sheet** | Sheet of 30-min slots ("EATEN AT"), auto-scrolled to the current value, future slots hidden for today (except planned meals). JS-only — no native picker dependency. | — |
| **Day picker sheet** | "Jump to a day": last 30 days with each day's logged calories from the range cache; selected row checked. | — |
| **Offline queue pill** | Top-floating pill while saves wait in the offline queue: "N meals saved on this phone — syncing when you're back online" + RETRY. Driven by `lib/queue.ts` subscription. | hidden / queued |
| **SegmentedToggle** | Pill segments (7d/30d, 30d/90d, Lose/Maintain/Gain); selected = primary fill + on-primary text. ≥44px. | selected / default |
| **Button** | `default` primary fill / `outline` / `destructive` / `ghost`; ≥44px primary, `sm` 36px only for dense secondary actions with expanded hit area. | default / pressed / disabled / loading (hand-rolled spinner) |
| **Input** | `bg-muted`, hairline border, `rounded-2xl`; PasswordInput adds show/hide eye. | focus / error |
| **Nutrition facts** | FDA-style label; "—" for unestimated values; "AI estimates, not lab-measured" note. | — |
| **Bevi** | 140px pose PNG, `FadeIn` 130ms. One per screen. | pose variants |
| **Alert / notice card** | Icon + title + body row (e.g. "Time for a weigh-in"). | default / destructive |

---

## 4. Screen specs

### 4.1 Authentication
- **Sign in** — Bevi (wave) + headline, email/password, Apple/Google SSO,
  links to sign-up/reset. **Sign up / Reset** — same frame (Bevi presence TBD-
  consistent with sign-in).

### 4.2 Onboarding
**Intro carousel** — 3 swipeable slides, skippable, bottom-anchored CTA:
1. "MEET LOGGI / Point it at anything edible." (Bevi phone-photo pose) — one
   camera for plate, label, barcode.
2. "THE SMART PART / Your target comes from your scale, not a formula."
3. "THE DEAL / No tricks." — the data promise: export everything, delete
   everything, stated plainly.

**Plan builder** — "Plan desk" kicker, step headline + subtitle, bottom
Continue: units → you (sex/age) → body (height/weight) → activity → goal
(direction, then a pace list with a "Recommended" option and honest blurbs) →
result ("Your plan is ready": estimated burn, target intake, macro split,
note that the trend later measures actual burn).

**Onboarding motion** (all 130ms, `Easing.out(quad)`, reduced-motion drops to
instant): step content fades+slides in the direction of travel (forward from
the right, back from the left; enter-only, no exit pass); progress-track
segments cross-fade their fill instead of snapping (§2.8 determinate-fill
rule); intro pager dots grow/shrink via layout transition; the intro ↔ plan
builder swap cross-fades instead of hard-cutting; the goal-pace list and
validation hints fade in; choice cards use `PressableScale` press feedback.

### 4.3 Core app (tabs)

**Today** — *Daily ledger.* Date kicker + greeting headline; day-nav arrow
buttons (swipes and arrows tick a light haptic; the center day label opens
the day picker sheet); Monday note card (top slot, when this week's recap
exists and isn't dismissed — written Sunday evening UTC but embargoed by
the API until the reader's local Monday); "STILL AVAILABLE / N CAL LEFT" metric +
progress ring — planned meals reserve budget ("N reserved for later" line;
remaining = goal − eaten − reserved); macro rows (eaten only); usual-meal
card (Bevi clipboard, "Log it" one-tap, dismissable); meal journal list.
Pull-to-refresh refetches meals + trends. States: skeleton · empty day (Bevi
standing, "Welcome back!" copy) · past-day (the "+" logs to that day). Soft
rolling `x/7` on-target counter — never a breakable chain; each past day is
graded by the goal that was in effect then (`lib/goal-history.ts`), so a
Monday smart-goal change can't rewrite last week. One Bevi per screen:
usual card > Monday note offer > empty state.

**Ask Bevi** (modal) — *Control room · Ask Bevi.* Session-only chat over the
user's own data + general nutrition (POST /api/ask). Empty state: Bevi
clipboard + honesty line ("personal answers come from your log and your
scale") + three starter chips. User turns are black bubbles right; Bevi turns
plain text on muted cards with a small standing Bevi. "Bevi's checking the
logs…" spinner line while waiting. Entry: "Ask Bevi" outline button in the
Weight header. Refusals and errors arrive as Bevi lines, never toasts.

**Menu Scout** (modal) — *Menu scout · Eating out?* Snap or pick a menu photo
(resized wider than food shots — small type); Bevi extracts dishes with
estimated macros and bands them against today's remaining budget: Fits
(mint) / Tight (cream) / Over budget (coral) chips, grouped in that order,
one assumption line ("Portions are my best guess from the menu"). Tap a dish
→ confirm alert → logged as a planned (reserved) meal → back to Today. Entry:
book-open button right of the camera shutter. Not-a-menu photos get a retry
line, never a dead end.

**Milestone card** — Lime block card under the Monday-note slot when a new
milestone is detected (first meal, 7 straight logged days, first "Working"
verdict, four weeks of weigh-ins — building-themed, never body-themed, no
breakable chains). Bevi celebrate + headline + one sub line; "Share it"
captures an offscreen 360×360 branded card (BUILT WITH LOGGI kicker, loggi
wordmark, Bevi) to the system share sheet — nothing auto-posts. Either action
marks it seen forever (AsyncStorage).

**Dinner-out Live Activity** (iOS 16.2+) — while any planned meal is reserved
today: lilac lock-screen banner ("DINNER OUT · ⟨meal⟩" kicker, "N cal
reserved" figure, "M cal still available after") and Dynamic Island
(fork.knife + reserved figure). Starts/updates/ends from the same cache sync
as the widgets — confirming or deleting the last planned meal ends it.

**History** — *Archive.* "PLATE INDEX / Calories" card — 7d/30d toggle, bar
chart with dashed goal line + y-axis + goal figure, and a one-line range
insight ("Avg N cal across M logged days · K on target"; today excluded from
the on-target count, same rule as Today); expandable day rows (destructive
figure + trend icon when over). Over/on-target uses the per-day goal history,
same as Today. Pull-to-refresh forces a refetch past the 30s freshness guard.

**Weight** — *Trend desk.* "+ Log" button (weigh-in sheet); weigh-in nudge
card when stale; "LATEST WEIGH-IN" metric card with 30d/90d chart (measured
dots + trend line + legend); stat cards (To go — when a goal weight is set —
Current rate, Maintenance); verdict/advisory card ("Collecting data" →
"on track" / "adjust"); weekly recap. Pull-to-refresh refetches trends.

**Settings** — *Control room.* Your goal (direction + rate preset chips with
custom input + optional goal weight; captions show current weight, a
direction-mismatch warning, an aggressive-rate warning, and a live "≈ cal/day
deficit · goal around ⟨month year⟩" line; Save); Daily targets (calories +
macros editable as % or grams via segmented toggle, preset splits — Balanced
/ High protein / Low carb — live gram/cal readout, Save disabled unless
valid; "Smart goal is managing calories" banner when adaptive is on); Smart
calorie goal switch with a live status line (active kcal + "recalculates
Monday", or "collecting data"); Monday note switch (weekly local Monday-9am
notification — scheduled on-device, nothing server-sent); Evening reminder
switch (8pm local nudge only on days with nothing logged — logging anything
cancels that day's; one-shot notifications rolled 7 days ahead so an
abandoned app goes quiet, `lib/reminder.ts`); Units (flipping converts
in-progress card drafts in place — no lost edits); Your profile (live
"estimated burn" readout from drafts + current trend weight, soft
out-of-range warnings); Apple Health connect with last-synced / tap-to-sync
line; Your data: dated JSON export + meals CSV (both built client-side from
`GET /api/account`), log-out confirm, type-DELETE two-step account deletion.
Danger actions visually separated.

### 4.4 Log flow

**Speed dial intents** (no chooser screen): Camera (default) · Speak
(dictation) · Search · Saved.

- **Camera** — one viewfinder for food photos, nutrition labels, barcodes; no
  mode picking (expo-camera). A barcode in frame auto-fires the Open Food
  Facts lookup (native AVFoundation scanning, first detection wins) and a
  yellow lock box (`#facc15`, 130ms fade-in, reduced-motion instant) marks
  the fired code while the lookup runs; food and labels are snapped to AI
  analyze, which reads both. Lookup misses surface inline, the camera stays
  live. Library pick available in-frame. *(The
  former vision-camera v5 corner-bracket reticle + hold-to-fire ring +
  MLKit label detection is parked: v5's Nitro camera session corrupts the
  Hermes heap on Expo 54/RN 0.81 — hard crash on device, with or without
  frame worklets. That UI lives at commit `e01cac5` if the stack ever
  stabilizes; §2.8's hold-ring linear-easing exception is dormant until
  then.)*
- **Speak** — live dictation → same analyze pipeline.
- **Search / Saved** — search-first modal ("Search meals, or describe a new
  one"), recents/favorites lists with photo-or-glyph rows; describe-by-text
  falls through to AI analysis. Saves are optimistic — the meal appears
  before the network answers — and offline saves queue silently, syncing on
  relaunch/foreground; an open review draft survives an app crash
  (`lib/queue.ts`, `lib/draft.ts`).
- **Review** — meal review + question card + "Eaten at" row (defaults to
  now, or noon on a backdated day; opens the time picker sheet — a forgotten
  breakfast shouldn't land as lunch) + "Haven't eaten this yet" checkbox
  (today only — saves the meal as planned, button becomes "Reserve it",
  future times allowed) + nutrition facts; Back / Save.
- **Failure handoff** — a stumped analysis offers "Describe it instead" /
  "Retry photo"; the log never dead-ends.
- **Meal drawer** — edit items/date & time/favorite; "I ate this" confirm on
  planned meals (re-stamps eaten-at to now); delete is instant with the undo
  toast as the net (no confirm dialog); "Didn't finish? Snap the plate" —
  empty-plate photo → AI per-item eaten fractions → confirm dialog ("you ate
  about N% — it's still an estimate") scales the saved numbers down.

### 4.5 Dark mode
Automatic with the system. Dark is a first-class theme: tokens authored
independently (§2.2), Bevi poses must be dark-safe (transparent, no baked-in
light surfaces), charts/icons must route through tokens or `useColors()` —
never hardcoded hex.

### 4.6 Widgets (iOS)
Home/lock-screen extension (`apps/mobile/targets/widgets/`), fed by the app
writing today's totals to the App Group on every meal/goal cache change.
Widgets reuse the Today hero card language: lime block (`#dceeb1`), black ink,
`rgba(0,0,0,0.12)` track, `#d92d20` when over goal — same in both system
themes (pastel blocks are theme-fixed, §2.2).
- **Today's progress** — small: calories ring with `N of goal` center;
  medium: ring + protein/carbs/fat bars (black / 70% / 50% ink, mirroring
  `MACRO_INK`). Tap opens the app.
- **Quick log** — small; camera glyph + "Log a meal"; deep links `loggi://add`.
- **Lock screen** — circular capacity gauge (calories) and inline
  "N kcal left" / "N kcal over"; system-tinted, no brand color.
- **Empty state** — "Loggi / Open the app to get started" (never opened).
- **Rollover** — payload carries its local date; a mismatched date renders as
  a fresh day (zero eaten, goals kept) and a midnight timeline entry flips it
  without the app opening.

---

## 5. Accessibility baseline
- Touch targets ≥44×44pt for primary controls; 36px `sm` only for dense
  secondary actions and only with expanded hit areas; ≥8px spacing.
- Text ≥4.5:1, graphical/chart elements ≥3:1 — verified light **and** dark.
- Icon-only buttons carry `accessibilityLabel`; expandable rows expose
  `accessibilityState`; charts get descriptive labels and pair color with
  text/legend.
- All motion honors reduced-motion; errors announced to screen readers
  (`accessibilityLiveRegion` / `role="alert"` equivalents).
- Native controls where possible; every field labeled; validate before submit.
