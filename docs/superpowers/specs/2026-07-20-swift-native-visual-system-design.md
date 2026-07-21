# Swift-Native Visual System — Design Spec

**Date:** 2026-07-20
**Status:** Approved (design), pending implementation plan
**Supersedes:** DESIGN.md §2.1 (art direction), §2.2 (palette), §2.3 (typography), §2.5–2.6 (shape/elevation) — see §8.

## 1. Why this exists

The Swift rewrite reached Phase 2 as a faithful 1:1 port of the React Native
app. That was the right call while proving the data layer and screens; it is
the wrong call from here. This spec changes the mandate from *port the RN app*
to *build the app iOS would build*, while keeping Loggi recognisably Loggi.

Two decisions from the user frame everything below:

1. **Rethink visuals from Swift's point of view, but do not look generic.**
2. **Identity carriers are vermilion and Bevi.** The 60px black type scale and
   the pastel block system are explicitly released.

Releasing type and pastels removes most of the app's current visual weight, so
this spec's central problem is what replaces it. The answer is the organizing
principle in §2.

## 2. Organizing principle: colour as data

**Every colour in the app encodes a specific meaning. Nothing is coloured for
decoration.**

Today's system already applies this to exactly one colour: vermilion means
"log something", never ornament. This spec extends that rule to the entire
palette.

This is the anti-generic mechanism, and it is worth being precise about why it
works. Stock iOS apps are not generic because they use `List` and
`NavigationStack`; they are generic because they accept *defaults* — system
blue tint, grouped grey cards, decorative colour applied wherever it looks
nice. An app where a user can point at any coloured pixel and get a
one-sentence answer to "what does that colour mean?" reads as designed, even
when every surface beneath it is stock UIKit. Apple's own Fitness app is the
reference: the rings are unmistakable, and nothing about them is a custom
control.

Three consequences, stated plainly because the third is a real cost:

1. **Surfaces go neutral and native.** Cards, lists, sheets and navigation use
   standard SwiftUI structure and system backgrounds. No pastel card fills, no
   bespoke card chrome.
2. **Charts and progress indicators become the visual centrepiece.** They carry
   the densest meaning, so they carry the colour.
3. **The app is quieter at rest.** A day with nothing logged is mostly neutral;
   colour arrives as the user logs. The current design is colourful the instant
   it opens. This is a deliberate trade, not an oversight.

## 3. The palette, and what validating it proved

Every value below was generated and validated by script, not chosen by eye.
The validator (reproduced in §3.4) checks three things for every colour:
WCAG contrast against its own background, CIEDE-style ΔE separation from every
colour it can appear *next to*, and that separation again under simulated
deuteranopia, protanopia and tritanopia (Viénot/Brettel LMS projection).

Four iterations were required. The failures are recorded here because they are
load-bearing design constraints, not implementation trivia.

### 3.1 Macro triad → a lightness ramp, not three hues

The first attempt gave protein/carbs/fat three distinct hues (blue, teal,
purple). It failed: under protanopia the blue/purple pair collapsed to ΔE 7.2,
and under tritanopia blue/teal collapsed to ΔE 3.5. Both are indistinguishable.

**Three simultaneously-visible hues that survive all three CVD types, in both
themes, while also clearing a reserved brand colour, is over-constrained.** Hue
is simply not a reliable channel when three categories must coexist.

Resolution: macros become a **single-hue sequential ramp** — one blue-violet
family in three lightness steps. Lightness survives every CVD type essentially
intact (ΔL 16–18 under all four vision models, vs. the ΔE 3.5 hue collapse).

| Role | Light | Dark | Contrast (light / dark) |
|---|---|---|---|
| Protein | `#16307A` | `#B9CCFF` | 12.08:1 / 12.24:1 |
| Carbs | `#3D5CB8` | `#7E9BE8` | 6.14:1 / 7.21:1 |
| Fat | `#7286D8` | `#4A63B5` | 3.43:1 / 3.49:1 |

Fat is **graphic-only** in both themes (≥3:1, below the 4.5:1 text threshold).
It may fill a bar or chart mark; it may never be used for text. This is a hard
constraint on implementation, not a preference.

Ramp order is fixed: protein darkest → fat lightest. The ordering is itself
information, so it must not be reordered per-screen.

### 3.2 "Approaching" is not a colour

The status triad originally had three states: on-target, approaching, over.
No usable colour exists for "approaching".

A search over the yellow/amber/gold region (the semantically obvious choice for
caution) returned **zero** candidates satisfying ≥4.5:1 on white and ≥24 ΔE
from vermilion under all CVD types. Widening the search returned only blues —
already the macro ramp, and semantically wrong for caution. The underlying
reason is structural: **under protanopia, vermilion desaturates toward exactly
the yellow-gold region**, so any caution colour collides with the one colour
this app has permanently reserved.

Resolution: **drop "approaching" as a colour entirely.** It is encoded by fill
proportion plus text — which is what a progress indicator already communicates
natively. This is the correct outcome, not a compromise: a bar that is 85% full
already says "approaching" without needing a hue.

### 3.3 Status colours, and the green/red problem

| Role | Light | Dark | Contrast (light / dark) |
|---|---|---|---|
| On target | `#116149` | `#4ECB92` | 7.42:1 / 9.58:1 |
| Over target | `#A5003C` | `#FF6FA0` | 7.88:1 / 7.48:1 |

Both clear vermilion under every CVD type (ΔE ≥20). Both clear the background
for text in both themes.

Two constraints the validator surfaced, which implementation **must** honour:

**(a) On-target vs over-target are not distinguishable by colour alone.**
Minimum ΔE between them is 7.3 (light, protanopia) and 2.0 (dark,
deuteranopia). This is the classic green/red collapse. A blue on-target was
tested as an alternative and passed the mutual check — but then collided with
the blue macro ramp (ΔE 4.1 vs carbs under tritanopia), so it was rejected.

The resolution is not another hue. **Wherever on-target and over-target can be
seen together — history bars, day rows, verdict cards — the distinction MUST
carry a redundant non-colour channel: an SF Symbol, a text label, or position.**
WCAG 1.4.1 requires this regardless; the validation simply proves it is
non-negotiable here rather than good practice.

**(b) On-target sits close to the macro ramp** (ΔE 7.9 light / 14.0 dark
against the nearest macro step under worst-case CVD). Status colour and macro
colour must therefore never share an unlabelled surface. In practice they
occupy different components — macros fill bars, status tints a verdict or a
figure — so this is a placement rule: **never place a status-coloured mark
directly adjacent to a macro-coloured mark without a text or symbol label on
at least one of them.**

### 3.4 Reserved and neutral

| Role | Value | Rule |
|---|---|---|
| Vermilion | `#e64a19` | "Log something". Logging entry points only. Never chrome, never data, never decoration. Unchanged. |
| Neutrals | system | Backgrounds, text, chrome, structure, dividers. Everything that is not data. |

Vermilion is deliberately excluded from the data palette. It is the only colour
whose meaning is an *action* rather than a *value*, and every data colour above
is validated to stay ≥20 ΔE away from it under all vision models.

The validator lives at `apps/ios/scripts/validate-palette.mjs` (ported from the
scratch scripts used to derive these values) and runs in CI. Any future colour
addition must pass it. A palette this constrained will not survive casual
edits, so the check is mechanical rather than a review convention.

## 4. Typography

Fixed pixel type is replaced wholesale by Dynamic Type. This is the single
largest accessibility defect in the current Swift port: `60pt`, `36pt`, `11pt`
literals ignore the user's text-size setting entirely, which fails the
project's own compliance checklist.

- Every size becomes a system text style, or `.custom(_:relativeTo:)` when a
  specific size is genuinely needed.
- Numeric figures keep `.monospacedDigit()` — tabular alignment is functional,
  not stylistic.
- The 11pt floor is retained as a floor for *unscaled* contexts only.
- Layouts must survive AX5 without truncating essential content. Where a
  horizontal layout cannot survive it, it reflows vertically via
  `ViewThatFits` or a size-category check.

The heavy-black display treatment is released per the user's decision. Weight
hierarchy now comes from the standard semantic styles.

## 5. Components

All rebuilt on native SwiftUI structure. The list is the gallery's contents.

| Component | Native basis | Colour role |
|---|---|---|
| Hero progress | `Gauge` / Swift Charts | macro ramp + status |
| Macro bars | native progress primitives | macro ramp, label-adjacent |
| Calorie / weight charts | Swift Charts + `.accessibilityChartDescriptor` | status for over/under, neutral otherwise |
| Rows, cards | `List` / `Section`, neutral surfaces | neutral |
| Sheets | `presentationDetents`, drag indicator | neutral |
| Buttons | `ButtonStyle`s | vermilion for logging only |
| Feedback | `.sensoryFeedback`, `.symbolEffect` | — |

Mechanics adopted alongside: `.refreshable`, `NavigationStack`, `.searchable`
where applicable, full VoiceOver labelling, and reduce-motion honoured on every
animation.

## 6. Deliverable: the component gallery

Per the user's "design system first" decision, this spec's implementation
produces **tokens plus a gallery**, not rebuilt screens.

The gallery is a DEBUG-only screen reachable by deep link (`loggi://gallery`),
rendering every component in every state: default, empty, loading, error,
over-target. It is the review surface and the compliance screenshot target.

It must render:
- light and dark,
- Dynamic Type from XS through AX5,
- and **at least one realistic full-screen composition**, not only an isolated
  component grid.

That last requirement is deliberate. Components in isolation always read as
clean; the honest signal about whether a neutral-surface, quiet-at-rest app
works is a full screen, and this spec's main risk (§9) is exactly that. The
composition makes that risk visible at review time rather than three screens in.

## 7. Scope

**In:** colour tokens, type scale, spacing, the component set in §5, the
gallery, the palette validator.

**Out:** rebuilding Today / History / Weight / Settings. Those four screens
continue to work as-is and will look inconsistent with the gallery until a
later phase rebuilds them. That inconsistency is expected, not a defect.

**Unchanged:** all data-layer work from Phases 0–1, the API contract, Bevi
assets, vermilion's meaning.

## 8. Effect on DESIGN.md

DESIGN.md is binding per AGENTS.md, and this spec contradicts it. On approval
of the implementation, these sections are **rewritten, not synced**:

- **§2.1 art direction** — "flat + stark, no gradients, no drop shadows" is
  superseded by native surfaces.
- **§2.2 palette** — pastel blocks removed; colour-as-data map replaces it.
- **§2.3 typography** — fixed scale replaced by Dynamic Type.
- **§2.5 / §2.6 shape & elevation** — deferred to native idiom.
- **§5 accessibility baseline** — retained and strengthened; §3.3's redundant-
  channel rule is added to it.

Retained unchanged: §1 app concept, §1.1 interaction principles (low friction,
warmth, gesture-optional, no learning curve), vermilion's accent discipline,
and Bevi's usage rules.

The RN app stops being the visual reference at this point. It remains the
reference for *behaviour* and API contracts until Swift reaches parity.

## 9. Risks

1. **Quiet-at-rest may read as plain.** The mitigation is the §6 full-screen
   composition — see it early, before it is expensive to change.
2. **Fat is graphic-only.** A single careless `Text(...).foregroundStyle(fat)`
   fails AA. The validator cannot catch usage, only values; this needs a code
   review rule and ideally a lint check.
3. **The macro ramp reads as "one colour" to a casual glance.** That is
   inherent to sequential encoding. Labels are mandatory (§3.3b), so the ramp
   is a reinforcement, never the sole signal.
4. **Four screens will look inconsistent** with the gallery during the gap.
   Accepted per §7.

## 10. Open questions for implementation planning

- Where does the gallery live in the target — a DEBUG-only file set, or a
  separate scheme?
- Does the palette validator run as a build phase or a CI step?
- Which screen gets rebuilt first once the system settles? (Today is the
  obvious candidate: highest traffic, densest colour use, and the best test of
  whether the quiet-at-rest concern is real.)
