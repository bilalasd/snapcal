---
name: screen-audit
description: "Screenshot every screen of the Loggi iOS app (light + dark) and audit each one for compliance against WCAG 2.2 AA, Apple HIG, PRODUCT.md, and DESIGN.md. Use when the user asks to audit/check the screens, verify accessibility or design compliance, do a visual QA/compliance pass, or after UI changes that touch multiple screens."
---

# Loggi screen audit

Capture every screen on the simulator, then judge each render against four
sources of truth and write a bucketed findings report. This is the repeatable
form of the manual audits done during the rewrite.

**The four sources**
- **WCAG 2.2 AA** + **Apple HIG** — the rubric is already written in
  `docs/release/compliance-checklist.md` (§Visual, §VoiceOver, §App Store).
  Read it first; it is the checklist you grade against.
- **PRODUCT.md** — what each screen must *do* (features, behaviour, promises).
- **DESIGN.md** — the exact look: tokens (`Theme2`), spacing (§2.4), motion
  (§2.8), typography, colour rules (§2.1 accent reservation), component specs,
  and the per-screen layouts in §4. §2.4 and §2.8 are exact specs, not
  guidelines.

Announce at start: "Using the screen-audit skill to screenshot and audit every screen."

## Prerequisites

- A booted **iPhone** simulator (`xcrun simctl list devices booted | grep iPhone`).
  Boot one if needed.
- A **Debug** build (the preview/gallery routes and the seeded Today only exist
  in DEBUG). `apps/ios/scripts/dev-loop.sh` builds Debug by default.
- `idb` for tapping (tab switches, speed dial, sheets). Find it on PATH or at
  the location the sim-tap recipe records; coordinates are in **points**
  (screenshot pixels ÷ 3 on a 3× device). Prefer `idb ui describe-all` to
  locate elements by accessibility label rather than hardcoding coordinates.

## Step 1 — Capture every screen

Work in **both appearances**. Set once per pass:
```sh
UDID=$(xcrun simctl list devices booted | grep iPhone | head -1 | sed -n 's/.*(\([A-F0-9-]*\)) (Booted).*/\1/p')
xcrun simctl ui "$UDID" appearance light   # then repeat the whole sweep with: appearance dark
SHOTS=/tmp/loggi-audit/$(date +%F)         # screenshots land here
```

### Tier 1 — routable screens (reliable, `-route` only, no session)

`dev-loop.sh` rebuilds + relaunches with a `-route` and screenshots in one go:
```sh
cd apps/ios
shoot() { ./scripts/dev-loop.sh "$SHOTS/$2-$APPEARANCE.png" "$1"; }
```
Capture each (route → name):

| Route | Screen |
|---|---|
| `today-preview` | Today (populated, seeded cache) |
| `today-preview?empty=1` | Today (empty state) |
| `onboarding-preview` | Onboarding questionnaire (first step) |
| `paywall-preview` | Paywall |
| `welcome` | Welcome carousel |
| `sign-in` | Sign in |
| `sign-up` | Sign up |
| `reset-password` | Password reset |
| `gallery` | Design-system gallery (token/component ramp) |

Routes come from `apps/ios/Loggi/Navigation/Route.swift`; keep this table in sync
if routes change.

### Tier 2 — signed-in tabs & flows (drive with idb from Today)

`history`, `weight`, `settings`, the add sheets, and Ask Bevi render only inside
the signed-in `RootView`, which `today-preview` provides. Launch it once, then
navigate by tapping — do **not** rebuild between these (dev-loop.sh reinstalls):
```sh
./scripts/dev-loop.sh "$SHOTS/today-$APPEARANCE.png" today-preview   # RootView is now up
```
Then, for each, use `idb ui describe-all --udid "$UDID"` to find the element by
its `AXLabel`, tap its frame centre, wait ~1s, and screenshot with
`xcrun simctl io "$UDID" screenshot "$SHOTS/<name>-$APPEARANCE.png"`:

- **History / Weight / Settings** — tab-bar buttons (labels "History", "Weight",
  "Settings"). Return to Today between captures.
- **Speed dial (fan open)** — tap the centre "+" (label "Log"), screenshot the fan.
- **Add sheets** — from the open fan tap "Describe", "Camera", "Speak", "Saved"
  in turn; screenshot each. The camera viewfinder is black on the sim (no
  camera) — expected; use the in-frame library pick to reach analyze/review if
  that path needs auditing.
- **Ask Bevi** — tap the bottom-right "Ask Bevi" button on Today.

### Optional — largest Dynamic Type (AX5)

Re-run the Tier-1 sweep with the content-size override to catch truncation/reflow:
```sh
xcrun simctl launch "$UDID" com.loggi.app -route today-preview \
  -UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge
```

## Step 2 — Audit each screenshot

Read `docs/release/compliance-checklist.md`, `DESIGN.md`, and `PRODUCT.md` first.
Then **look at every screenshot** (light and dark) and grade it. For a big sweep,
fan the screens out to subagents (one per screen or tab group), each returning
its findings; otherwise do it inline.

For each screen check, concretely, against what is actually rendered:

- **Contrast** — body text ≥ 4.5:1, large/bold ≥ 3:1. Spot the known-risky pairs
  from the checklist: black-on-lime/cream/lilac/coral, white-on-vermilion.
- **Touch targets** ≥ 44×44 pt — icon-only buttons (dial actions, ✕, day arrows).
- **Dark mode** — no hardcoded inks bleeding onto themed surfaces; pastel cards
  keep black ink by design (that's correct, not a finding).
- **Colour-not-alone** — over/under states pair icon + text, not colour only.
- **DESIGN.md conformance** — spacing/typography/tokens match; the screen's §4
  layout is honoured; accent (`#e64a19`) only on logging entry points.
- **HIG** — safe-area insets, standard nav, legible system controls, nothing
  clipped or under the tab bar.
- **PRODUCT.md** — the screen delivers its promised function and copy.

Bucket every finding (same scheme as the rewrite audits):
- **violation** — the render contradicts a doc or a WCAG/HIG criterion.
- **drift** — the doc is stale vs a deliberate implementation (fix the doc).
- **gap** — something promised in PRODUCT/DESIGN is absent.

VoiceOver/label and reduce-motion items in the checklist can't be seen in a
still — note them as "verify on device", don't mark them pass/fail from a shot.

## Step 3 — Report

Write a dated report. Default: present it in the conversation and save to
`/tmp/loggi-audit/$(date +%F)/REPORT.md` (offer to relocate into the repo if the
user wants to keep it — audits are point-in-time, so they don't live in the repo
by default).

Structure:
```
# Loggi screen audit — <date>
Method: <N screens × light/dark (+AX5)>, simulator <model>.

## Summary
- Violations: N   Drift: N   Gaps: N   (top 3 most severe called out)

## <Screen name>   [light/dark shots: paths]
- [violation] <what contradicts which doc/criterion, with the fix>
- [drift] <doc line that's stale vs the deliberate impl>
- [gap] <promised in PRODUCT/DESIGN §x, absent>
(— clean — if nothing found)
```
Rank most-severe first. If a finding is really a stale doc, say so and (with the
user's ok) fix DESIGN.md/PRODUCT.md rather than the code — DESIGN.md tracks the
shipped app.

## Notes

- This skill is under `.claude/` (gitignored), so it's local tooling, not
  committed — matching the repo's other skills.
- Route strings are the contract with `Route.swift`; if a screen won't load,
  re-check the parse table there.
- Menu Scout was removed from navigation; its route still parses but there's no
  entry point — skip it unless it's re-added.
