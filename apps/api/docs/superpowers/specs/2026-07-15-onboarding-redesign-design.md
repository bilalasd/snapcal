# Loggi — Onboarding Redesign

**Date:** 2026-07-15
**Status:** Approved
**Context:** Onboarding asked personal questions before ever showing what the
app does. Goal: friendly, easy, benefit-first — aligned to PRODUCT.md.

## 1. Intro carousel (new, before the plan builder)

Three horizontally-swipeable screens (native `ScrollView` paging), page dots,
"Skip" top-right, Bevi on each. Each screen's headline is one of PRODUCT.md §5's
uncopyable claims; subtitles are Bevi's first person.

1. **"Point it at anything edible."** — plate, label, or barcode; one camera,
   meals logged in seconds (speed is retention).
2. **"Your target comes from your scale, not a formula."** — setup numbers are
   a starting guess; every Monday the target is re-derived from the real weight
   trend. Frames the questionnaire as low-stakes.
3. **"No tricks."** — I'll say when I'm guessing; data is private, export or
   delete everything in one tap. **Absorbs the privacy step** (7 → 6 steps).

Last button: "Build my starting plan" ("starting" deliberately — the real
target later comes from evidence). One "!" maximum across the whole flow.

## 2. Plan builder copy pass

Steps: units → you → body → activity → goal → result (privacy step removed).
All copy rewritten in Bevi's voice — warm, brief, benefit-first, no body
commentary; weight talk stays about the trend and the plan. Kicker becomes the
editorial "Plan desk". Progress bar unchanged.

## 3. Result screen

Bevi (celebrate) above "Your starting plan is ready 🎉". Copy reframed around
the doctrine loop: log meals, weigh in when you can, in ~2 weeks the scale
takes over from the formula. Button stays "Start tracking".

## Constraints

No new dependencies, files (beyond this spec), or backend changes. 130 ms
ease-out fades only, no springs. Bevi sparse — one appearance per screen.
Poses per moment: camera (screen 1), scale (screen 2), promise (screen 3),
celebrate (result), wave (sign-in). Onboarding is first-run only (`!goals.onboarded`),
so the carousel always showing is correct.
