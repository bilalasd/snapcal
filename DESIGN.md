# SnapCal — Design Specification

> Format: **Google Stitch** design brief — an app concept, a single design theme
> (the generative "design system"), a component inventory, and one generation
> spec per screen. Values are pulled from the live implementation
> (`src/app/globals.css`, `src/app/layout.tsx`), not idealized.

---

## 1. App concept

**SnapCal** is a mobile-first calorie & weight tracker. You photograph a meal,
an AI reads the plate and estimates nutrition, you confirm, and the app tracks
intake against a personalized target and a smoothed weight trend.

- **Platform:** Mobile web / PWA, portrait, 390 × 844 base viewport.
- **Audience:** People cutting or maintaining weight who want low-friction,
  photo-first logging with honest, measured feedback.
- **Voice:** Editorial, confident, plainspoken — a "daily ledger," not a
  gamified toy. Section labels read like a newspaper desk ("TREND DESK",
  "CONTROL ROOM", "PLATE INDEX").
- **Tone words:** warm, tactile, print-editorial, decisive, trustworthy.

---

## 2. Design theme

The one theme applied to every screen. In Stitch terms, this is the prompt you
would reuse across all screen generations.

> **Theme prompt:** "Warm editorial print aesthetic on cream paper. Heavy black
> display type, tightly tracked. Flat cards with a single soft drop shadow and a
> clipped 'torn' bottom-right corner. One amber accent used sparingly. Faint
> triangular paper-grain texture behind content. No gradients, no glassmorphism,
> no rounded-pill everything — square-ish, tailored, confident."

### 2.1 Art direction
- **Flat + editorial**, not material or skeuomorphic. Zero decorative gradients.
- **Notched cards:** every primary card clips its bottom-right corner
  (`clip-path` "torn paper" cut) — the signature shape.
- **Paper grain:** a faint 22px triangular grid fades in behind scroll content.
- **Amber discipline:** the amber accent is a spotlight (CTAs, active tab,
  progress, streak) — never a background wash.

### 2.2 Color palette

Semantic tokens (CSS custom properties). Authoritative source is OKLCH; hex is
the sRGB approximation for reference.

**Light (default)**

| Role | Token | Hex | Use |
|---|---|---|---|
| Background | `--background` | `#F9F3E6` | App canvas (cream paper) |
| Foreground | `--foreground` | `#131205` | Primary text (near-black) |
| Card | `--card` | `#FFFDF5` | Card surfaces |
| Primary | `--primary` | `#F7B828` | Amber — **fills only** (CTA, tab, ring) |
| Primary (strong) | `--primary-strong` | `#995700` | Amber **text** on light (AA-safe) |
| Secondary | `--secondary` | `#E5DABF` | Chips, quiet fills |
| Muted | `--muted` | `#E9E1CE` | Track/placeholder surfaces |
| Muted foreground | `--muted-foreground` | `#595546` | Labels, kickers, secondary text |
| Accent | `--accent` | `#F8C970` | Soft amber highlight |
| Destructive | `--destructive` | `#C53829` | Errors, over-target, delete |
| Border | `--border` | `#C2B69F` | Hairlines, input borders |
| Chart 1 | `--chart-1` | `#AE7300` | Calories bars / weight trend line |
| Chart 2 | `--chart-2` | `#207773` | Measured weight dots (teal) |
| Chart 3 | `--chart-3` | `#4E6734` | Carbs (olive) |
| Chart 4 | `--chart-4` | `#B75B55` | Fat alt (clay) |
| Chart 5 | `--chart-5` | `#3B3920` | Protein (dark olive) |

**Dark**

| Role | Token | Hex |
|---|---|---|
| Background | `--background` | `#0A0B04` |
| Foreground | `--foreground` | `#F0EBDE` |
| Card | `--card` | `#19180C` |
| Primary | `--primary` | `#FBBB2D` |
| Primary (strong) | `--primary-strong` | `#FBBB2D` |
| Muted foreground | `--muted-foreground` | `#ACA493` |
| Destructive | `--destructive` | `#EA6C5A` |
| Chart 1 / 2 | `--chart-1` / `--chart-2` | `#FBBB2D` / `#52B0AB` |

**Contrast rules (WCAG AA, verified):** amber is a *fill* color paired with
near-black text (10.8:1); as *text* it must use `--primary-strong` (5.6:1 light /
10.5:1 dark). Muted foreground is ≥6.7:1 on both card and background. Chart
series meet ≥3:1 against their surface. Dark mode is authored independently, not
inverted.

### 2.3 Typography
- **Display / body:** **Nunito** (`--font-sans`) — a single humanist sans across
  the app. Headlines use weight **900 (black)**, tightly tracked (`-0.075em`),
  line-height `0.9`.
- **Numerals / mono:** **Geist Mono** (`--font-geist-mono`) — reserved contexts.
- **Tabular figures** on all data (calories, macros, weights, timers) to prevent
  layout shift.

| Style | Spec | Role |
|---|---|---|
| Headline | Nunito 900, `text-4xl`, tracking `-0.075em`, lh `0.9` | Screen titles ("Weight", "History") |
| Big metric | Nunito 900, `text-6xl`, tracking `-0.09em`, tabular | "696 kcal left" |
| Kicker | Nunito 800, `0.68rem`, tracking `0.24em`, UPPERCASE, muted | Section eyebrows ("DAILY LEDGER") |
| Body | Nunito 400–600, 16px, lh 1.5 | Paragraphs, list content |
| Label | Nunito 500–700, 12–14px | Field labels, macro readouts |

### 2.4 Spacing & layout
- **Grid:** 4/8px rhythm. Section gaps `16 / 20 / 24px`; card padding `16px`.
- **Container:** `max-w-md` (28rem), centered, `px-16px` gutters.
- **Base viewport:** 390px; safe-area insets respected top and bottom.
- **Vertical rhythm:** hairline `editorial-rule` dividers separate sections.

### 2.5 Shape & radius
- **Base radius:** `0.45rem`, scaled `sm 0.6× → 4xl 2.6×`. Deliberately modest —
  square-leaning, not pill-round.
- **Signature cut:** `.editorial-cut` clips the bottom-right corner
  `polygon(0 0, 100% 0, 100% calc(100%-18px), calc(100%-22px) 100%, 0 100%)`.

### 2.6 Elevation & effects
- **Cards:** `bg-card/90` + `1px` foreground/15 ring + **one** large soft shadow
  `0 20px 70px foreground@12%`. No stacked shadows.
- **Photo frame:** hard-offset amber shadow `8px 8px 0 var(--primary)` (print
  registration look), slight rotation on thumbnails.
- **Grain:** `.editorial-grain::after` — 22px triangular grid at 18% opacity,
  masked to fade downward.

### 2.7 Iconography
- **Lucide** line icons, one family, ~1.8–2.4 stroke. No emoji as structural
  icons (only decorative 👋 / 🎉 in onboarding copy).
- Icon sizes tokenized (`size-4` inline, `size-6` feature, `size-7` tab).
- Active nav icons thicken stroke (`2.4`) and gain a drop-shadow.

### 2.8 Motion
- **`snap-in`:** `520ms cubic-bezier(0.2, 0.8, 0.2, 1)` entrance for sections.
- **Micro-interactions:** `active:scale-95` press feedback; bar/ring fills
  transition `500ms`.
- **Analyzing overlay:** full-screen scan-line sweep (`1.8s` alternate), rotating
  status text; disabled under `prefers-reduced-motion`.
- Durations stay 150–520ms; no linear easing on UI transitions.

---

## 3. Component inventory

| Component | Description | States |
|---|---|---|
| **Header bar** | Sticky. Logo + "DAILY LEDGER / SnapCal", "KCAL" chip. | — |
| **Tab bar** | Fixed bottom, 4 destinations + center "+" action (notched amber tile). ≥44px targets, safe-area padded. | active / inactive |
| **Editorial card** | Cream card, ring, soft shadow, notched corner. | — |
| **Metric block** | Oversized tabular number + kicker + sublabel. | positive / over-target (destructive) |
| **Progress ring** | Circular % logged, amber arc. | compact / full |
| **Macro bars** | Labeled horizontal bars (protein/carbs/fat), color + text %. | — |
| **Meal list item** | Utensils thumbnail, time, name, macros, kcal. | tap → drawer |
| **Bar chart** | Calories/day + y-axis scale + dashed Goal line + tap tooltip. | loading / empty |
| **Composed chart** | Weight scatter (measured) + trend line + **legend** + tooltip. | 30d / 90d |
| **Meal review** | Editable meal; items collapse to a summary row, tap to reveal number grid (progressive disclosure). | collapsed / expanded |
| **Question card** | Amber-bordered; question + tappable answer chips + free-text "Send". | with/without choices |
| **Analyzing overlay** | Full-screen scan animation + rotating status. | — |
| **Drawer / sheet** | Bottom sheet over 40–60% scrim; native `<input type="date">`. | — |
| **Choice card** | Onboarding option tile, selectable, optional "Recommended" badge. | selected / default |
| **Toggle group** | Segmented control (7d/30d/90d, Light/Dark/Auto). ≥44px. | — |
| **Button** | default/lg/icon ≥44px; sm 36px dense secondary; amber fill / outline / ghost. | default / hover / pressed / disabled / loading |
| **Nutrition facts** | FDA-style label; "—" for unestimated values. | — |
| **Toast** | Sonner, auto-dismiss, `aria-live`. | success / error |

---

## 4. Screen specs

Each screen is a Stitch generation spec: **purpose · layout · key components ·
states**. Grouped by flow. (25 captured references live in `preview/`.)

### 4.1 Authentication

**Sign in** (`sign-in.png`)
- **Purpose:** Return users authenticate.
- **Layout:** Centered logo + tagline "Snap it. Track it. Trust the trend." over
  a white auth card on cream.
- **Components:** Clerk card — Apple / Google SSO, email field, "Continue" CTA,
  footer link to sign up.

**Sign up** (`sign-up.png`)
- Same frame; "Create your account", adds password field, footer link to sign in.

### 4.2 Onboarding — 6-step plan builder

Full-height flow: logo + **6-segment progress bar**, `PLAN BUILDER` kicker,
headline + subtitle, step content, bottom-anchored **Continue** (thumb reach).

1. **Units** (`onboarding.png`) — two ChoiceCards: `kg·cm` / `lb·ft`.
2. **You** (`onboarding-you.png`) — Sex (male/female) + Age field.
3. **Body** (`onboarding-body.png`) — Height + Current weight (starting chart point).
4. **Activity** (`onboarding-activity.png`) — sedentary → very active list.
5. **Goal** (`onboarding-goal.png`) — Lose / Maintain / Gain, then a pace list
   with a "Recommended" badge.
6. **Result** (`onboarding-result.png`) — "Your plan is ready 🎉": estimated burn,
   **target intake** (amber-strong), macro split (P/C/F % + grams), a note that
   the Trends screen later measures actual burn. CTA "Start tracking".

### 4.3 Core app (bottom-tab destinations)

**Today** (`today.png`) — *Daily ledger*
- **Purpose:** Today's remaining calories + macros + meal journal.
- **Layout:** Date kicker + greeting headline + streak chip (`x/7 days`);
  day-nav row (‹ swipe ›); big "STILL AVAILABLE / kcal left" card with progress
  ring + macro bars; "MEAL JOURNAL" list.
- **States:** loading skeleton · **empty day** (`today-empty.png`, "No meals this
  day" + "Add to this day") · past-day (URL `?date=`, the "+" logs to that day).

**History** (`history.png`) — *Archive*
- **Purpose:** Calorie trend + per-day breakdown.
- **Layout:** "PLATE INDEX / Calories" card — 7d/30d toggle, **bar chart with
  y-axis scale + dashed Goal line + tap tooltip**; expandable day rows (kcal in
  amber-strong; destructive when over).
- **States:** row collapsed / expanded.

**Weight** (`weight.png`) — *Trend desk*
- **Purpose:** Weight trend vs. plan.
- **Layout:** "Log weight" CTA; "MEASURED LINE" card — 30d/90d toggle, composed
  chart (teal measured dots + amber trend line + **legend**); stat cards (To go,
  Current rate, Maintenance); "Adjust intake" advisory (icon + text); Weekly recap.

**Add / Log a meal** (`add.png`) — *Camera first*
- **Purpose:** Start a log via photo, text, favorite, or search.
- **Layout:** favorites chips; large dashed **camera capture** (up to 3 photos);
  "CONTEXT NOTE" textarea + dictation mic; **Analyze** CTA; "Add from food
  database"; search + **deduped, capped "Recent meals"** list.
- **States:** empty note (Analyze disabled) · analyzing (overlay).

**Settings** (`settings.png`) — *Control room*
- **Purpose:** Goal, targets, units, profile, appearance, integrations.
- **Layout:** Your goal (+ Change goal); Daily targets (calories + P/C/F %, live
  gram readout, **Save disabled unless % total = 100**); Units; Your profile
  (sex/age/height/activity); Appearance (Light/Dark/Auto); Google Health connect;
  Log out (spatially separated).

### 4.4 Mid-flow & sheets

**AI review** (`review.png`) — *AI readback*
- **Purpose:** Confirm/correct the AI's estimate before saving.
- **Layout:** "Review the plate"; optional **Question card** (question + answer
  chips + "…or type your own answer" → Send); **Meal review** with items
  collapsed to summary rows (tap to edit numbers); Add item; Nutrition Facts;
  Back / Save.
- **States:** with question / clean · item collapsed / expanded · saving.

**Analyzing overlay** (`analyzing.png`)
- Full-screen: user's photo (or plate glyph) with sweeping scan line, "Reading
  your plate…", rotating status ("Identifying foods…"). Portaled above all chrome.

**Meal drawer** (`meal-drawer.png`) — bottom sheet: "Edit meal" name, native date
picker, Nutrition Facts, Favorite / Log again / Delete, Save changes.

**Food search drawer** (`food-search.png`) — "Search foods / Whole ingredients
with lab-measured nutrition", search input, results list.

**Log weight drawer** (`log-weight.png`) — "Log your weight" tip, weight input,
native date picker, Save.

### 4.5 Dark mode
Every screen ships a dark variant (`*-dark.png`) — deep near-black canvas, warm
cream text, bright amber accent, independently contrast-tuned (not inverted).
Toggle: Settings → Appearance (Light / Dark / Auto), stored in
`localStorage["snapcal-theme"]`.

---

## 5. Accessibility baseline
- Touch targets ≥ 44×44px (primary controls); dense secondary ≥ 36px with
  expanded hit areas; ≥ 8px spacing.
- Text ≥ 4.5:1, graphical/chart elements ≥ 3:1 — verified light **and** dark.
- Visible focus rings; icon buttons carry `aria-label`; charts pair color with a
  legend/labels; motion respects `prefers-reduced-motion`.
- Native controls where possible (`<input type="date">`); forms label every field
  and validate before submit.
