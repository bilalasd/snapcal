# Loggi — full app audit vs DESIGN.md + PRODUCT.md

*2026-07-15. Method: code audit of every screen and component (3 parallel read-only agents) + live simulator screenshots of 7 screens × light/dark. Buckets: **violation** (code contradicts doc) · **drift** (doc stale vs deliberate implementation) · **gap** (promised, absent).*

> **Fix pass, same day (verified in simulator, light + dark):**
> - **Resolved:** 0.A (DESIGN.md rewritten to match the app — app is source of truth), 0.B (PRODUCT.md §7 un-parked), 1–5 (all High: `text-primary-foreground` systemic fix, charts/ring/icons through `useColors()`, duplicate-key bug root-caused to colliding tick indices on degenerate data, block-card ink pinned), 6 (BarChart y-axis; tooltip deferred), 7 (legend + To go card + clipped label), 8 (one Bevi per screen), 9 ("Meet Bevi"), 10 (reduced-motion on list animations), 11 (44pt via hitSlop), 12 (FAB bottom insets), 16 (auth live-regions + Button `loading`), 17 (Log out separated, de-reddened), 20 (day-nav hint → position label; macro bars fixed ink).
> - **Extra found & fixed:** `bg-block-*` classes on `Card` silently lost the class conflict with `bg-card` — pastel cards weren't rendering at all; now applied via inline style (`lib/colors.ts block`). GoalCard field labels pinned via new `Field labelClassName`.
> - **Deferred:** 6's tap tooltip, 13 (Appearance toggle — app follows system by design now), 14 (Bevi phone-pose PNG white table edge — asset regen), 15 (native date pickers — new dependency), 18–19 (moot or design-call), 21 (recorded in DESIGN.md as deliberate deviations).

---

## 0. Two doctrine-level calls only you can make

**A. The visual theme diverged from DESIGN.md wholesale — decide which is truth.**
DESIGN §2 mandates amber-on-cream, Nunito, editorial-cut torn corners, paper grain, teal/olive chart series. The mobile app ships black/white/magenta, flat rounded cards, grayscale charts (`global.css:13–24`, `tailwind.config.js:24–39`). There is zero amber anywhere. Every §2 check is technically a violation, but it reads as a deliberate rebrand — DESIGN.md still describes the web app. **Either update DESIGN.md with the mobile theme, or the app needs an amber/cream pass.** Everything below assumes the mobile theme is intentional.

**B. PRODUCT.md §7 still says dark mode is parked and the app pinned light.**
The app now ships full dark tokens and `userInterfaceStyle: "automatic"` (committed). The doc's stated fear — "doing it properly means a full dark pass over every screen" — is exactly what the High findings below confirm. **Update §7, and treat the dark-contrast fixes as the price of un-parking it.**

---

## 1. High — broken today, fix first

1. **Systemic white-on-white in dark: every primary button and selected toggle loses its label.**
   Root cause, not per-screen: `ui.tsx:34` (`BTN_TEXT.default = "text-white"` on `bg-primary`) and `ui.tsx:215` (SegmentedToggle selected chip), plus `settings.tsx:511` OptionRow. `--primary` flips to near-white in dark, the hardcoded white text doesn't. Blanks: Save goal, Save targets, + Log, Log meal, 7d/30d/90d & Lose/Maintain/Gain selected chips, Units/Activity rows, onboarding Continue. *Fix: `text-primary-foreground` in ~3 places.* (DESIGN §5 contrast, verified in dark screenshots.)

2. **Charts and the progress ring hardcode hex — invisible or near-invisible in dark.**
   `charts.tsx:19,50,68,133–141` (bars/trend line `#000000`, dots `#6b6b6b`, axes/goal `#565656`, over-target `#d92d20`), `progress-ring.tsx:24,34` (track `#f7f7f5`, arc `#000000`). Weight trend line is black-on-black; Today's hero ring invisible both directions. (DESIGN §5 "chart ≥3:1, light **and** dark".)

3. **`bg-block-*` pastel cards keep themed text → light-on-light in dark.**
   Fixed pastels + `text-foreground` (near-white in dark): the "Still available / cal left" hero (`index.tsx:259–264`), usual-meal card (`index.tsx:309`), History chart card, Weight weigh-in + recap cards, Settings goal card. Either pin block-card text to a fixed dark ink or give blocks dark variants.

4. **React duplicate-key bug on Weight/History charts.** "Encountered two children with the same key" error toast fires on chart mount and persists app-wide (seen on every simulator screen). Likely keying by rounded label/date in `charts.tsx`. Dev-only toast, real defect.

5. **Icon-color hex sweep (~15 spots) won't flip in dark.** Day-nav chevrons `#000` (`index.tsx:242,248` — core Today control, invisible in dark), `meal-drawer.tsx:131–139`, `meal-review.tsx:72–142`, `history.tsx:155–158`, `index.tsx:323,355`, `analyzing-overlay.tsx:49` (`#fff` check on near-white). `useColors()` exists for exactly this.

## 2. Medium

6. **History chart misses its spec: no y-axis scale, no tap tooltip** (`charts.tsx:14–77`); dashed goal line floats unlabeled. WeightChart has axis ticks; BarChart doesn't. (DESIGN §4.3/§3.)
7. **Weight screen: no legend, no "To go" stat card, no Weekly recap** (`charts.tsx:80–150`, `weight.tsx:144–157`) — legend is also the a11y requirement ("color paired with legend"). Y-axis top label clips ("190.1" cut).
8. **Two Bevis on empty Today** — usual-meal card Bevi + empty-state Bevi render together (`index.tsx:308–332`); PRODUCT §4: "one Bevi appearance per screen".
9. **"MEET LOGGI" kicker over a picture of Bevi** (onboarding slide 1) — conflates app and mascot; PRODUCT §4 names the beaver Bevi.
10. **Reduced-motion honored inconsistently** — tab bar gates on `useReducedMotion()` but screen list animations don't (`index.tsx:363–364`, `history.tsx:145,163`). (DESIGN §2.8/§5.)
11. **Primary actions at 36px**: Weight "Log" (`weight.tsx:81`), usual-meal "Log it" (`index.tsx:322` — a headline PRODUCT flow), clarify "Send"/"Re-analyze" (`questions-step.tsx:83–90`, `add.tsx:384`) — all `size="sm"` with no hitSlop; DESIGN §5 wants ≥44px for primary controls.
12. **FAB overlaps bottom content** — Today empty-state "Log a meal" and Settings "Save targets" sit under the floating + (screenshots); lists need bottom inset.
13. **No Appearance toggle in Settings** (Light/Dark/Auto per DESIGN §4.3) — theme is system-only. Conflicts with PRODUCT §7 either way; decide with item B.
14. **Dark-unsafe Bevi asset**: the phone-photo pose has a baked-in white table edge that reads as an artifact on dark (onboarding screenshot). Other poses are clean.

## 3. Low

15. Date fields are free-text "YYYY-MM-DD" `Input`s, not native pickers (`meal-drawer.tsx:123`, `log-weight-drawer.tsx:62`); DESIGN §4.4/§5 wants native controls.
16. Auth inline errors lack `accessibilityLiveRegion` (sign-in:66, sign-up:71/98, reset:73/91); Button has no first-class `loading` state (`ui.tsx:39–68`).
17. Log out sits inside the "Your data" card between Export and Delete, not spatially separated (`settings.tsx:257–263`).
18. Onboarding result screen doesn't visually elevate target intake (`onboarding.tsx:352`); kicker says "Plan desk" vs spec "PLAN BUILDER" (:396).
19. Sign-up/reset screens have no Bevi while sign-in does — warmth inconsistent across auth.
20. Today's "TAP ARROWS FOR PAST DAYS" is instructional copy (§1.1 "if a screen needs explaining…"); macro fill bars use fixed dark-gray `chart` tokens that fade on dark muted tracks (`index.tsx:298`).
21. Deliberate deviations worth recording in DESIGN.md, not fixing: analyzing overlay = pulse+checklist instead of scan-line (reduced-motion done right); barcode hold-ring uses linear easing (correct for a determinate countdown); "Google Health" in doc vs Apple Health in code; 3-slide intro pager supersedes §4.2's 6-step-only flow (newer 2026-07-15 spec); native `Alert` instead of Sonner toasts.

## 4. PRODUCT.md promise audit — everything ships ✅

| Promise | Status | Evidence |
|---|---|---|
| Usual-meal one-tap card | ✅ | `api/meals/suggestions` + `index.tsx:308–327` |
| Weekly adaptive smart goal (Monday-frozen) | ✅ | `trends/route.ts:96–108`, shown Today + Weight |
| Full JSON export, one tap | ✅ | `account/route.ts` GET + `settings.tsx:92–108` |
| True account deletion | ✅ | `account/route.ts` DELETE (blobs, rows, Clerk) |
| Confidence marks, assumptions, ×½/×2 | ✅ | `types.ts:75–78`, `meal-review.tsx` (clears flag on human edit) |
| One camera: food/label/barcode | ✅ | `camera-capture.tsx`, no mode picking |
| Optimistic saves | ✅ | `cache.ts` + `add.tsx:255–302` |
| Soft, unshatterable streak | ✅ | `index.tsx:143–150`, rolling x/7 |
| Dark mode "parked" | ⚠️ doc stale | see item B |

## 5. What's solidly on-doctrine

Voice is genuinely good everywhere sampled — warm, brief, single-"!", no guilt ("Welcome back! No catch-up needed", "That one stumped Bevi"). Motion doctrine holds: 130ms `Easing.out` across the board, zero springs. Every gesture has a tap equivalent. Honest-numbers is the strongest section: amber-marked guesses, USDA grounding, tappable questions with free-text fallback, NutritionFacts printing "—" plus "AI estimates, not lab-measured". The log flow never dead-ends. Export/delete are real, one tap each, and stated during onboarding.

**The pattern in one sentence:** the mechanisms are all there — tokens, `useColors()`, dark palette, a11y labels — but ~20 call sites bypass them with hardcoded hex/`text-white`, which is why dark mode breaks everywhere at once; fix findings 1–5 and the dark theme goes from demo to shippable.
