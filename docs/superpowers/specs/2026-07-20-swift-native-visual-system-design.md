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

1. **Surfaces go native, and warm rather than neutral-grey.** Cards, lists,
   sheets and navigation use standard SwiftUI structure over the warm canvas of
   §3.0 — not system greys. No pastel card fills, no bespoke card chrome.
2. **Charts and progress indicators become the visual centrepiece.** They carry
   the densest meaning, so they carry the colour.
3. **Colour concentrates where the data is.** A day with nothing logged shows
   little data colour; colour arrives as the user logs. This is the intended
   rhythm — see §3.0, which is what keeps that from reading as cold.

### 2.1 Calm, warm, happy — and where that lives

An earlier draft of this spec described the resting state as "quiet". That was
wrong, and the correction matters enough to record: the target is **calm and
warm, but happy** — a dashboard that feels good to open on a day you logged
nothing.

The important insight is that warmth is **not** in tension with colour-as-data,
because warmth lives in the *canvas and surfaces*, and surfaces are not data.
The clinical feeling of the first draft came from specifying a pure `#ffffff` /
`#0c0c0c` ground, not from the discipline about data colour. Warming the ground
costs nothing in principle and, as §3.0 shows, almost nothing in contrast.

How each quality is produced, concretely:

- **Calm** — low-chroma surfaces, generous whitespace, no competing accents,
  and motion that settles rather than bounces (fast ease-out, never springs).
- **Warm** — an oat/cream canvas and a warm near-black in dark mode, plus a
  warm-hued macro ramp (§3.1). Nothing in the app is pure white or pure black.
- **Happy** — colour *arrives as reward*. An empty day is warm and inviting; a
  logged day fills with the macro ramp. Bevi appears at earned moments. The
  fill itself is the celebration, so delight is a consequence of use rather
  than decoration applied on top.

This is why the §6 gallery must include a realistic empty-state composition,
not only a populated one. "Calm and warm rather than empty and cold" is a claim
that can only be judged on a real screen with no data in it.

## 3. The palette, and what validating it proved

Every value below was generated and validated by script, not chosen by eye.
The validator (`apps/ios/scripts/validate-palette.mjs`, committed alongside
this spec) checks three things for every colour:
WCAG contrast against its own background, CIEDE-style ΔE separation from every
colour it can appear *next to*, and that separation again under simulated
deuteranopia, protanopia and tritanopia (Viénot/Brettel LMS projection).

Five iterations were required. The failures are recorded here because they are
load-bearing design constraints, not implementation trivia.

### 3.0 The canvas is warm, and every colour is checked against two grounds

Nothing in the app is pure white or pure black.

| Role | Light | Dark |
|---|---|---|
| Canvas | `#FAF6EF` (oat) | `#1A1613` (warm near-black) |
| Raised surface (cards, rows, sheets) | `#FFFCF7` | `#241F1A` |

The dark canvas stays dark enough to avoid OLED smear — the same reasoning
DESIGN.md's original dark palette used — while carrying a brown tint rather
than a blue-grey one.

Because a raised surface sits above the canvas, **every data colour is
validated against both grounds, and the worst of the two must clear 3:1.** The
raised surface is usually the tighter constraint, and validating only against
the canvas is how a palette silently fails on cards. The validator enforces
this.

Warming the ground cost almost nothing: the largest contrast change across the
whole palette was ~0.5:1, and no colour changed category as a result.

### 3.1 Macro triad → a lightness ramp, not three hues

The first attempt gave protein/carbs/fat three distinct hues (blue, teal,
purple). It failed: under protanopia the blue/purple pair collapsed to ΔE 7.2,
and under tritanopia blue/teal collapsed to ΔE 3.5. Both are indistinguishable.

**Three simultaneously-visible hues that survive all three CVD types, in both
themes, while also clearing a reserved brand colour, is over-constrained.** Hue
is simply not a reliable channel when three categories must coexist.

Resolution: macros become a **single-hue sequential ramp** in three lightness
steps. Lightness survives every CVD type essentially intact (ΔL 16–18 under all
four vision models, vs. the ΔE 3.5 hue collapse).

The family is **warm plum-berry**, not the cool blue-violet of the first draft.
A cool ramp on a warm canvas fought the ground and reintroduced exactly the
clinical feeling §2.1 rejects. Both were validated; plum-berry passes
everywhere the cool ramp does, and matches the warmth target.

| Role | Light | Dark | Worst-case contrast (light / dark) |
|---|---|---|---|
| Protein | `#4A1D4E` | `#F0C4F4` | 12.36:1 / 10.82:1 |
| Carbs | `#7D3A82` | `#C48ACA` | 6.96:1 / 6.09:1 |
| Fat | `#B072B5` | `#94599B` | 3.29:1 / 3.24:1 |

Contrast shown is the worst of canvas and raised surface (§3.0). Ramp
separation is ΔL 15.9 (light) / 18.1 (dark) under every CVD type.

Fat is **graphic-only** in both themes (≥3:1, below the 4.5:1 text threshold).
It may fill a bar or chart mark; it may never be used for text. This is a hard
constraint on implementation, not a preference. Dark-mode fat was lightened
from an earlier `#8A4F90` specifically because that value cleared the canvas
but failed on the raised surface at 2.80:1 — the exact failure mode §3.0 exists
to catch.

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

**(b) On-target vs the macro ramp — resolved by the warm ramp.** With the cool
blue-violet ramp this was a real collision (ΔE 7.9 light against the nearest
macro step under worst-case CVD). Moving the ramp to plum-berry raised that to
**ΔE 33.6**, comfortably clear. Labelling stays good practice, but this is no
longer a constraint the design depends on — a genuine simplification that fell
out of the warmth change rather than being engineered.

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
| Rows, cards | `List` / `Section`, warm raised surface (§3.0) | neutral |
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
clean; the honest signal about whether the warm-canvas, colour-arrives-with-use
approach works is a full screen — including an EMPTY one, since "calm and warm
rather than empty and cold" (§2.1) is precisely the claim that needs judging.
This makes the spec's main risk (§9) visible at review time, not three screens in.

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

1. **A low-data day may still read as sparse.** The warm canvas (§3.0) is the
   primary mitigation — an oat ground with no data should feel calm and
   inviting rather than blank. This is a judgement call that cannot be settled
   on paper, so the §6 gallery MUST include a realistic EMPTY-state screen.
   See it early, before it is expensive to change.
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
  whether the warm-canvas empty state lands as calm rather than sparse.)
