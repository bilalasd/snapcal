# Loggi — Product Doctrine

What Loggi is, what it refuses to be, and how every feature and sentence
should decide. Visual system lives in [DESIGN.md](DESIGN.md); this is the
layer above it. Written 2026-07-15, after the competitive research that shaped
the "competitive edges" round.

---

## 1. The one-liner

**Loggi answers one question: "is my plan actually working?"**

Point the camera at anything edible, confirm what Bevi saw, and your weight
trend — not a formula — tells you whether to eat more, less, or keep going.

Everything else is in service of that loop:
log fast → measure honestly → adapt the target → repeat.

## 2. Goals

**For the user**

1. Logging a meal costs seconds, not minutes. Logging fatigue is the #1
   reason people quit trackers (most quit within three weeks) — speed *is*
   retention.
2. The daily calorie target is evidence, not arithmetic. Static
   calculator numbers drift from reality; Loggi's smart goal re-derives the
   target every Monday from the measured weight trend and logged intake.
3. Never feel judged. Coming back after a gap is welcomed, not scolded.
   A missed day has zero consequences in the UI.

**For the product**

1. Win the intersection nobody occupies: photo-logging speed (Cal AI's
   pitch) *and* adaptive weight-trend science (MacroFactor's pitch) in one
   app, at an honest price.
2. Be the tracker that admits it's estimating — trust as a feature.
3. Stay cheap to run: AI ≈ pennies per analyzed meal, free-tier
   infrastructure, no growth machinery that costs more than it returns.

## 3. Principles

Ordered — when two collide, the earlier one wins.

1. **Seconds to log, always.** The camera is the front door: one viewfinder
   handles food photos, nutrition labels, and barcodes — no mode picking.
   Saves are optimistic (the meal appears before the network round-trip).
   Repeat meals get offered proactively ("Your usual lunch?") for one-tap
   logging. Any new step in the logging path must justify its taps.
2. **Honest numbers over confident numbers.** Photo AI is genuinely
   uncertain about portions — Loggi says so instead of hiding it. Items the
   AI isn't sure about are marked, portions are stated as assumptions in
   plain language ("1 cup cooked rice"), corrections are one tap (×½/×2,
   tappable clarifying questions), and estimates are grounded against USDA
   lab data when a confident match exists. Never display false precision;
   never bury a guess under a confident integer.
3. **The trend is the truth.** Daily weight is noise; the smoothed trend and
   the energy-balance math derived from it are the signal. Verdicts
   ("working" / "adjust") and the adaptive goal come from measured data, and
   they hold still for a week at a time — a target that wobbles daily teaches
   nothing.
4. **Your data is yours.** Private to your account, never sold, never used
   for ads. Full JSON export and true account deletion, both one tap in
   Settings, both stated plainly during onboarding. No dark patterns
   anywhere: no hidden pricing, no fake urgency, no guilt loops. (The
   category leader has a data breach and a deceptive-billing takedown on its
   record — this principle is also positioning.)
5. **Warm, brief, never guilt.** Bevi's voice (see §4). Streaks encourage
   but never shame; a 3+ day gap earns "Welcome back — no catch-up needed,"
   not a broken-chain funeral.
6. **Boring reliability over clever features.** If the AI fails, the user
   falls back to text description, search of their own history, or manual
   entry — the log never dead-ends. New surface area must earn its keep.

## 4. Personality — Bevi and the voice

**Who:** Bevi the Beaver, Loggi's mascot. A beaver because beavers *build* —
steadily, a little every day, unbothered by any single day's weather.

**Character:** the friend who happens to be a coach. Knowledgeable but never
lecturing, industrious but relaxed, honest to a fault ("I'm guessing on
these portions") and quietly proud of you. Never a cheerleader, never a cop.

**Voice rules**

- Warm, brief, plainspoken. One idea per sentence.
- First person is Bevi's ("I'm guessing on the portions marked in orange").
- Honest about uncertainty; specific about what to do next.
- Never guilt, never streak-shaming, never body commentary. Weight talk
  stays about the *trend and the plan*, not the person.
- No exclamation spam. One "!" is celebration; two is desperation.
- Editorial frame stays (kickers like "TREND DESK", "CONTROL ROOM") — Bevi
  is the voice *inside* a confident print layout, not a cartoon takeover.

| Situation | Yes | No |
|---|---|---|
| Analysis fails | "That one stumped Bevi — try a clearer photo." | "Error: analysis failed (502)" |
| Low confidence | "I'm guessing on the portions marked in orange — worth a quick check." | Silent confident numbers |
| Returning after 4 days | "Welcome back! No catch-up needed." | "You broke your 12-day streak" |
| Over target | "Over target" (state it, move on) | "You blew it today 😬" |

**Presence:** sparse by design — one Bevi appearance per screen, at moments
that matter (empty states, onboarding, the usual-meal offer, low-confidence
notes).

**Feel: snappy but fluid.** The app responds instantly — optimistic saves,
cached screens that paint before the network answers, taps that never wait on
a spinner they don't have to — but nothing teleports or jolts. State changes
glide: fast ~130 ms ease-out fades and layout transitions, no springs, no
bounce, no decorative motion. Snappy is the priority (fluid never adds
latency); fluid is what keeps snappy from feeling twitchy.

## 5. Differentiation

The market splits into speed apps with no science and science apps with slow
logging. Loggi's position is the intersection, plus trust.

| | Cal AI (and clones) | MyFitnessPal | MacroFactor | **Loggi** |
|---|---|---|---|---|
| Photo logging | ✅ fast | ❌ | ✅ (recent, slower) | ✅ fast, one camera for food/label/barcode |
| Adaptive target from real weight trend | ❌ | ❌ | ✅ (its moat) | ✅ weekly smart goal |
| Admits estimate uncertainty | ❌ hides it | n/a | partially | ✅ confidence marks + assumption language |
| Repeat-meal prediction | ❌ | ❌ | ❌ | ✅ "your usual" one-tap card |
| Pricing/trust record | dynamic pricing, breach, App Store removal | barcode scan paywalled ~$20/mo | $72/yr, no free tier | flat honest price, export + true delete |
| Personality | clinical | clinical | spreadsheet-serious | Bevi — warm, honest, editorial |

**Claims Loggi can make that competitors can't copy cheaply:**

- "Point the camera at anything edible — plate, label, or barcode."
- "The tracker that tells you when it's guessing."
- "Your target comes from your scale, not a formula."
- "Looks like your usual breakfast — log it?"
- "Export everything. Delete everything. No tricks."
- "Didn't finish? Snap the empty plate — Bevi subtracts the leftovers."
- "Eating out tonight? Reserve the calories before you go."
- "Bevi's Monday note: your week's verdict, every Monday morning."

**What Loggi deliberately does NOT compete on** (entrenched moats or crowded
lanes — spending here violates principle 6):

- Database size (MyFitnessPal's 14M entries)
- Micronutrient depth (Cronometer)
- GLP-1 clinical features (Welling)
- Social feeds, community, and gamification that punishes (breakable
  all-time chains, guilt loops). Soft rolling counters that reset weekly and
  can't "shatter" are fine — they encourage without a funeral (principle 5).

## 6. Pricing

**$4.99/month or $49.99/year, 15-day free trial.** Decided 2026-07-15.

- The monthly/annual gap is narrow (~17%, "two months free") **on purpose** — a
  screaming "SAVE 60%!" spread is the dark-pattern anchor trick this product
  positions against. Annual is a convenience, not a trap.
- The trial is time-based, not scan-capped: 15 days of the real product. A full
  trial costs ~$0.35 in AI calls — recovered in the first paid month at any
  sane conversion rate. Revisit only on abuse or conversion well under 5%.
- Cost basis: ~$0.75/month marginal per active user (Gemini analysis is ~90%
  of it), ~$2/month assumed all-in → ~53% (monthly) / ~44% (annual) margin
  after Apple's Small Business 15% cut.
- Every re-log, barcode scan, and "usual meal" tap is served free — the UX
  push toward one-tap logging is also the cost lever.
- Surfaced in the pricing screen after the plan builder (DESIGN.md §4.2):
  plans + trial stated plainly, native App Store sheet does the charging.

## 7. The test

Before shipping a feature or a sentence, it should pass:

1. Does it make logging faster, the numbers more honest, or the verdict
   clearer? (If none — why does it exist?)
2. Would it survive the user reading exactly how it works? (No dark
   patterns, no hidden math.)
3. Would Bevi say it to a friend? (Warm, brief, no guilt.)

## 8. Parked — deliberate not-nows

Ideas that passed the test but lost the priority fight. Revisit when the core
loop is shipped and stable; don't build them speculatively.

- ~~**Dark mode.**~~ Un-parked 2026-07-15: the app now follows the system
  appearance with an independently authored dark token set (see DESIGN.md
  §2.2/§4.5). The rule that made it scary stands as the rule that makes it
  work: no hardcoded hex — every color routes through tokens or `useColors()`.
