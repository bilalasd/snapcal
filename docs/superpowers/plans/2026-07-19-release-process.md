# Release Process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the runbook, versioning/release-notes tooling, and compliance gates defined in `docs/superpowers/specs/2026-07-19-release-process-design.md` (the production-env archive pipeline from that spec is already implemented in `apps/mobile/scripts/archive.sh`).

**Architecture:** Everything is docs + two POSIX shell scripts (with one embedded python3 JSON edit — no new dependencies). Scripts live in `apps/mobile/scripts/` next to the existing `archive.sh` and `repatch-bacons.py`. Docs live at repo root (`RELEASE.md`, `CHANGELOG.md`) and `docs/release/`.

**Tech Stack:** bash, python3 (stdlib json), git tags. No new packages.

## Global Constraints

- Repo root: `/Users/muhammadbalagamwala/Documents/Projects/2026/SnapCal` (run tasks in the main checkout, current branch `main`).
- Versioning: marketing version = `expo.version` in `apps/mobile/app.json` (semver `X.Y.Z`); build number = `expo.ios.buildNumber` (string integer, monotonic, never reused). Tag format exactly `v<version>-<build>` (e.g. `v0.1.0-1`).
- Release notes file: `CHANGELOG.md` at repo root, keep-a-changelog headings (`## [X.Y.Z] - YYYY-MM-DD`).
- Scripts must `set -euo pipefail` and exit non-zero on any gate failure.
- Never run `expo` commands from the repo root — only from `apps/mobile`.
- Commit after each task with the message given in the task.

---

### Task 1: Seed CHANGELOG.md and initialize build number

**Files:**
- Create: `CHANGELOG.md`
- Modify: `apps/mobile/app.json` (add `expo.ios.buildNumber`)

**Interfaces:**
- Produces: `CHANGELOG.md` with a `## [0.1.0]` section (Task 4's runbook and Task 2's tag reference it); `expo.ios.buildNumber = "1"` (Tasks 2 and 3 read this exact JSON path).

- [ ] **Step 1: Create CHANGELOG.md**

```markdown
# Changelog

Release notes for Loggi. Every build gets an entry BEFORE it is archived —
the text here is pasted into TestFlight "What to Test" and the App Store
"What's New" field. Format: [keepachangelog.com](https://keepachangelog.com).

## [Unreleased]

## [0.1.0] - 2026-07-19

First TestFlight cut. Everything is new:

- Log meals by photo, barcode, voice, search, or saved favorites — Bevi
  estimates calories and macros, and asks when portions are ambiguous.
- Today screen with smart daily budget, streaks, milestones, and a meal
  journal; History with 7/30-day charts; Weight with trend + verdicts.
- Smart weekly calorie goal from your real weight trend (Monday updates),
  Apple Health weigh-in sync, iOS widgets, evening reminder, Monday note.
- Offline logging queue, optimistic saves, full data export (JSON/CSV),
  in-app account deletion, dark mode.
```

- [ ] **Step 2: Initialize the iOS build number**

Run:
```bash
cd /Users/muhammadbalagamwala/Documents/Projects/2026/SnapCal
python3 - <<'EOF'
import json
p='apps/mobile/app.json'
d=json.load(open(p))
d['expo']['ios']['buildNumber']='1'
json.dump(d,open(p,'w'),indent=2)
EOF
python3 -c "import json; print(json.load(open('apps/mobile/app.json'))['expo']['ios']['buildNumber'])"
```
Expected output: `1`

- [ ] **Step 3: Verify app config still parses**

Run: `cd apps/mobile && npx expo config --type public >/dev/null && echo CONFIG-OK`
Expected: `CONFIG-OK`

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md apps/mobile/app.json
git commit -m "release: seed CHANGELOG and initialize iOS buildNumber"
```

---

### Task 2: scripts/bump-build.sh

**Files:**
- Create: `apps/mobile/scripts/bump-build.sh` (mode 755)

**Interfaces:**
- Consumes: `apps/mobile/app.json` fields from Task 1.
- Produces: command `scripts/bump-build.sh [--version X.Y.Z]` (run from `apps/mobile`) that increments `expo.ios.buildNumber`, optionally sets `expo.version`, commits `app.json`, and creates annotated tag `v<version>-<build>`. Task 3's check and Task 4's runbook call it by this exact path.

- [ ] **Step 1: Write the script**

```bash
#!/bin/bash
# Bump the iOS build number (and optionally the marketing version), commit,
# and tag v<version>-<build>. Usage, from apps/mobile:
#   scripts/bump-build.sh                 # buildNumber +1
#   scripts/bump-build.sh --version 0.2.0 # also set expo.version
set -euo pipefail
cd "$(dirname "$0")/.."

NEW_VERSION="${2:-}"
[[ "${1:-}" == "--version" && -z "$NEW_VERSION" ]] && { echo "usage: bump-build.sh [--version X.Y.Z]" >&2; exit 1; }

read -r VERSION BUILD < <(python3 - "$NEW_VERSION" <<'EOF'
import json, sys
new_version = sys.argv[1]
p = 'app.json'
d = json.load(open(p))
e = d['expo']
if new_version:
    e['version'] = new_version
e['ios']['buildNumber'] = str(int(e['ios']['buildNumber']) + 1)
json.dump(d, open(p, 'w'), indent=2)
print(e['version'], e['ios']['buildNumber'])
EOF
)

TAG="v${VERSION}-${BUILD}"
git rev-parse "$TAG" >/dev/null 2>&1 && { echo "BLOCKED: tag $TAG already exists — build numbers are never reused." >&2; exit 1; }
git add app.json
git commit -m "release: ${TAG}"
git tag -a "$TAG" -m "Loggi ${VERSION} build ${BUILD}"
echo "Bumped to ${VERSION} (${BUILD}) and tagged ${TAG}. Push with: git push origin main ${TAG}"
```

- [ ] **Step 2: Make executable and test the failure path (duplicate tag)**

Run:
```bash
chmod +x apps/mobile/scripts/bump-build.sh
cd apps/mobile && git tag -a v0.1.0-2 -m tmp && ./scripts/bump-build.sh; echo "exit=$?"
```
Expected: `BLOCKED: tag v0.1.0-2 already exists…` and `exit=1`, and `git status --porcelain app.json` shows a modified app.json (the JSON edit ran before the guard) — restore it:
```bash
git checkout app.json && git tag -d v0.1.0-2
```

- [ ] **Step 3: Test the success path**

Run: `cd apps/mobile && ./scripts/bump-build.sh && git tag -l 'v0.1.0-*' && git log --oneline -1`
Expected: tag `v0.1.0-2` exists; last commit message `release: v0.1.0-2`; `buildNumber` in app.json is `"2"`.
Then undo the test bump (we don't want to burn build 2 on a dry run):
```bash
cd /Users/muhammadbalagamwala/Documents/Projects/2026/SnapCal
git tag -d v0.1.0-2 && git reset --hard HEAD~1
```

- [ ] **Step 4: Commit the script**

```bash
git add apps/mobile/scripts/bump-build.sh
git commit -m "release: add bump-build script (version + buildNumber + tag)"
```

---

### Task 3: scripts/release-check.sh (mechanical compliance gate)

**Files:**
- Create: `apps/mobile/scripts/release-check.sh` (mode 755)

**Interfaces:**
- Consumes: `apps/mobile/app.json` buildNumber (Task 1), git tags from Task 2's format.
- Produces: command `scripts/release-check.sh [--production]` (run from `apps/mobile`), exit 0 = all gates pass. Task 4's runbook invokes it before every archive.

- [ ] **Step 1: Write the script**

```bash
#!/bin/bash
# Mechanical release gates — the failure classes Loggi has actually shipped.
# Usage, from apps/mobile:  scripts/release-check.sh [--production]
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
flag() { echo "FAIL: $1" >&2; FAIL=1; }

SRC=(app components lib)

# 1. Text below the 11pt HIG floor.
if grep -rnE 'text-\[(10|[0-9])px\]' "${SRC[@]}"; then flag "text below 11px (HIG floor)"; fi
if grep -rnE 'fontSize: ?(10|[0-9])\b' "${SRC[@]}"; then flag "fontSize below 11 (HIG floor)"; fi

# 2. Icon-only controls without an accessibility label: any size="icon"
#    element must carry accessibilityLabel within the same JSX tag.
python3 - <<'EOF' || FAIL=1
import re, pathlib, sys
bad = []
for d in ('app', 'components'):
    for f in pathlib.Path(d).rglob('*.tsx'):
        src = f.read_text()
        for m in re.finditer(r'<(Button|Pressable)[^>]*size="icon"[^>]*?>', src, re.S):
            if 'accessibilityLabel' not in m.group(0):
                line = src[:m.start()].count('\n') + 1
                bad.append(f"{f}:{line}")
if bad:
    print("FAIL: icon-only control without accessibilityLabel:", *bad, sep="\n  ", file=sys.stderr)
    sys.exit(1)
EOF

# 3. console.log left in app code (error/warn are allowed).
if grep -rn 'console\.log' "${SRC[@]}"; then flag "console.log in app code"; fi

# 4. Hardcoded hex ink regression: count must not exceed the audited baseline
#    (fixed pastel surfaces legitimately use black/white ink — see DESIGN.md).
BASELINE=$(grep -c '^' scripts/ink-baseline.txt 2>/dev/null || echo 0)
CURRENT=$(grep -rhoE 'color="#[0-9a-fA-F]{3,8}"' "${SRC[@]}" | wc -l | tr -d ' ')
if [ "$CURRENT" -gt "$BASELINE" ]; then
  flag "hardcoded hex inks grew: $CURRENT > baseline $BASELINE (audit new ones, then regenerate scripts/ink-baseline.txt)"
fi

# 5. Build number must be ahead of the last release tag.
BUILD=$(python3 -c "import json; print(json.load(open('app.json'))['expo']['ios']['buildNumber'])")
LAST_TAG_BUILD=$(git tag -l 'v*' | sed 's/.*-//' | sort -n | tail -1)
if [ -n "$LAST_TAG_BUILD" ] && [ "$BUILD" -le "$LAST_TAG_BUILD" ]; then
  flag "buildNumber $BUILD not bumped past last tag's build $LAST_TAG_BUILD (run scripts/bump-build.sh)"
fi

# 6. CHANGELOG has content under [Unreleased] or a section for the current version.
VERSION=$(python3 -c "import json; print(json.load(open('app.json'))['expo']['version'])")
if ! grep -q "## \[$VERSION\]" ../../CHANGELOG.md; then
  flag "CHANGELOG.md has no section for $VERSION — write the release notes first"
fi

# 7. Production-only: no test keys anywhere in the release path.
if [ "${1:-}" = "--production" ]; then
  if grep -rn "pk_test" .env.production eas.json 2>/dev/null; then
    flag "pk_test key in release config (need pk_live)"
  fi
fi

[ $FAIL -eq 0 ] && echo "release-check: all gates passed"
exit $FAIL
```

- [ ] **Step 2: Generate the ink baseline from the current audited tree**

Run:
```bash
cd apps/mobile
grep -rhoE 'color="#[0-9a-fA-F]{3,8}"' app components lib | sort > scripts/ink-baseline.txt
wc -l scripts/ink-baseline.txt
```
Expected: a small count (~15–25 lines — the audited fixed-pastel inks).

- [ ] **Step 3: Make executable, test current tree passes**

Run: `chmod +x scripts/release-check.sh && ./scripts/release-check.sh; echo "exit=$?"`
Expected: `release-check: all gates passed`, `exit=0`. (If gate 6 fails because `expo.version` ≠ `0.1.0`, the CHANGELOG section and version are out of sync — fix whichever is wrong; they must match before this task completes.)

- [ ] **Step 4: Test a gate actually fires**

Run:
```bash
echo '<Text className="text-[9px]">x</Text>' > components/__gate_test.tsx
./scripts/release-check.sh; echo "exit=$?"
rm components/__gate_test.tsx
```
Expected: `FAIL: text below 11px…` and `exit=1`.

- [ ] **Step 5: Test the production gate fires (pk_test still present)**

Run: `./scripts/release-check.sh --production; echo "exit=$?"`
Expected: `FAIL: pk_test key in release config…`, `exit=1`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/scripts/release-check.sh apps/mobile/scripts/ink-baseline.txt
git commit -m "release: add mechanical compliance gate (release-check.sh)"
```

---

### Task 4: RELEASE.md runbook

**Files:**
- Create: `RELEASE.md` (repo root)

**Interfaces:**
- Consumes: `scripts/bump-build.sh` (Task 2), `scripts/release-check.sh` (Task 3), `scripts/archive.sh` (exists), `CHANGELOG.md` (Task 1), `docs/release/compliance-checklist.md` (Task 5 — forward reference is fine, the file lands next task).

- [ ] **Step 1: Write RELEASE.md**

```markdown
# Releasing Loggi

Two channels. **Beta** = TestFlight. **Production** = the same TestFlight-
proven binary promoted in App Store Connect — never a fresh build.
All commands run from `apps/mobile` unless noted.

## One-time setup (status tracked here — check off as done)

- [ ] Apple Developer Program enrollment ($99/yr) — required for TestFlight.
      Xcode mints the Apple Distribution certificate on first Distribute.
- [ ] App Store Connect app record for bundle id `com.loggi.app`.
- [ ] Subscription products created in App Store Connect matching
      `MONTHLY_SKU` / `YEARLY_SKU` in `lib/purchases.ts`; Sandbox tester
      account for IAP verification.
- [ ] Production Clerk instance; paste its `pk_live_…` key into
      `apps/mobile/.env.production`; set matching live keys on Vercel
      production (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
- [ ] `ANTHROPIC_API_KEY` set on Vercel production (photo analysis 500s
      without it): `printf 'sk-ant-…' | npx vercel env add ANTHROPIC_API_KEY production`
- [ ] Public Privacy Policy + Terms of Use URLs; paywall links to both
      (App Store guideline 3.1.1 — REQUIRED before first submit).

## Beta (TestFlight)

1. **Notes first.** Write the release section in `CHANGELOG.md`
   (`## [X.Y.Z] - date`). No notes → no build.
2. **Clean tree on main**, merged and pushed. `git status` clean.
3. **Quality gates:**
   ```bash
   yarn workspace @loggi/mobile typecheck
   yarn workspace @loggi/api test        # from repo root
   ./scripts/release-check.sh            # from apps/mobile
   ```
4. **Screenshot sweep** (light + dark) per `docs/screenshots.md`; eyeball
   against `docs/release/compliance-checklist.md` §Visual if screens changed.
5. **Bump + tag:** `./scripts/bump-build.sh` (add `--version X.Y.Z` when the
   marketing version changes). Push: `git push origin main --tags`.
6. **Archive:** `./scripts/archive.sh` → `build/Loggi.xcarchive`
   (verifies the embedded bundle env automatically).
7. **Upload:** Xcode → Window → Organizer → select archive → Distribute App
   → App Store Connect. First time: let Xcode create the distribution cert.
8. **TestFlight:** paste the CHANGELOG entry into "What to Test". Internal
   group first. Run the on-device smoke script (below). Promote to the
   external group once it survives a day of real use.

### On-device smoke script (every beta)

- Log a meal by **photo**; confirm calories land on Today.
- Log by **voice** (hold-to-talk from the dial) and by **search**.
- Scan a **barcode**; confirm lookup or the miss card.
- Add a **weigh-in**; Weight chart updates; widget shows today's numbers.
- **Paywall:** plans load with prices; Restore Purchases responds.
- Airplane mode: log a meal, re-enable network, confirm the queue drains.
- VoiceOver on: tab bar + Today card + dial are all announced sensibly.

## Production (App Store)

1. Beta build has soaked with testers — no new build, promote that binary.
2. **Full compliance pass:** every box in
   `docs/release/compliance-checklist.md`.
3. **Production gates:** `./scripts/release-check.sh --production` (blocks on
   pk_test) and `./scripts/archive.sh --production` if a rebuild was ever
   needed (it shouldn't be — promote the beta binary).
4. App Store Connect: version page → select the TestFlight build → paste the
   CHANGELOG entry into "What's New" → **phased release ON** → submit.
5. After approval: verify the tag `v<version>-<build>` is pushed; move the
   CHANGELOG section from Unreleased if anything trailed; note any review
   feedback at the bottom of this file.

## If local builds ever break (fallback: EAS)

`npx eas build --profile production --platform ios` then
`npx eas submit` — profiles in `eas.json` read `.env.production`. Costs
build credits; only needed if this Mac's toolchain regresses.

## Review feedback log

(append App Store review outcomes here)
```

- [ ] **Step 2: Verify every referenced path exists**

Run (repo root):
```bash
ls apps/mobile/scripts/archive.sh apps/mobile/scripts/bump-build.sh \
   apps/mobile/scripts/release-check.sh CHANGELOG.md docs/screenshots.md && echo REFS-OK
```
Expected: `REFS-OK` (compliance-checklist.md arrives in Task 5).

- [ ] **Step 3: Commit**

```bash
git add RELEASE.md
git commit -m "release: add RELEASE.md runbook (beta + production)"
```

---

### Task 5: Compliance checklist

**Files:**
- Create: `docs/release/compliance-checklist.md`

**Interfaces:**
- Consumes: nothing. Referenced by `RELEASE.md` (Task 4).

- [ ] **Step 1: Write the checklist**

```markdown
# Compliance checklist — WCAG 2.2 AA · Apple HIG · App Store Review

Run the FULL list before every production submit. For betas, run §Visual on
screens that changed. Mechanical items are covered by
`apps/mobile/scripts/release-check.sh` and are not repeated here.

## §Visual — WCAG + HIG (verify with the screenshot loop, light AND dark)

- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 for ≥18pt/14pt-bold). Spot-check pastel
      cards: black-on-lime, black-on-cream, black-on-lilac, black-on-coral,
      and the white-on-vermilion streak badge.
- [ ] All touch targets ≥ 44×44pt (including hitSlop). New icon buttons
      measured, not assumed.
- [ ] Dynamic Type: at the largest accessibility size, no essential text
      truncates; layouts reflow (sim: Settings → Accessibility → Larger Text).
- [ ] Dark mode intentional on every changed screen — no hardcoded inks on
      themed surfaces (fixed pastel cards keep black ink by design).
- [ ] Nothing conveyed by color alone (over-budget states pair icon + text).
- [ ] Reduce Motion honored: decorative animations (dial fan-out, card
      entrances, press-scale) disabled when the setting is on.

## §VoiceOver / input (on device)

- [ ] Every interactive element announces a meaningful label; icon-only
      buttons especially (dial actions, close ✕, day arrows).
- [ ] Reading order is logical on Today, Add review, Onboarding.
- [ ] Custom gestures have button/menu equivalents (dial drag → tap works;
      day-swipe → arrows exist; hold-to-talk → speak screen tap).
- [ ] Keyboard/Switch Control can reach every control in the auth + settings
      forms.

## §App Store Review

- [ ] Privacy nutrition labels in App Store Connect match reality: health
      data (weight, meals), identifiers (Clerk user id), diagnostics
      (Sentry). Health data is NEVER used for tracking/ads.
- [ ] Every `NS*UsageDescription` string in `app.json` accurately describes
      use (camera, mic, speech, HealthKit).
- [ ] Sign in with Apple present wherever any third-party sign-in shows,
      listed first.
- [ ] Account deletion reachable in-app (Settings → Delete account) and
      actually erases server data.
- [ ] IAP (guideline 3.1.1): subscriptions purchasable only via StoreKit;
      price + billing period visible before purchase; Restore Purchases
      works on a clean install; paywall links to Privacy Policy AND Terms
      of Use (EULA); free-trial terms accurate.
- [ ] No test/debug UI reachable; no Metro dependence in the archive
      (archive.sh verifies embedded bundle).
- [ ] Export compliance: standard HTTPS only → "uses exempt encryption"
      (set `ITSAppUsesNonExemptEncryption=false` in app.json infoPlist to
      skip the per-build question).
- [ ] Age rating questionnaire answered (health/wellness, no restricted
      content).

## §Store assets

- [ ] Screenshot sets current (6.9" required; reuse the screenshot-loop
      captures, status bar clean).
- [ ] Name, subtitle, keywords, description reviewed; support URL live;
      privacy policy URL live.
```

- [ ] **Step 2: Commit**

```bash
git add docs/release/compliance-checklist.md
git commit -m "release: add WCAG/HIG/App Store compliance checklist"
```

---

### Task 6: Update SHIP.md (local builds replace EAS instructions)

**Files:**
- Modify: `SHIP.md` (section 3, currently titled "Build with EAS (native build — local CocoaPods hangs on this Mac, so use EAS cloud)")

**Interfaces:**
- Consumes: `RELEASE.md` (Task 4).

- [ ] **Step 1: Replace section 3 of SHIP.md**

Replace the entire section starting `## 3. Build with EAS` (heading plus its
code block) with:

```markdown
## 3. Build & release ✅ PROCESS EXISTS — see RELEASE.md

Local Xcode builds are the path (verified 2026-07-19: `pod install` +
`xcodebuild archive` succeed on this Mac — the old "local CocoaPods hangs"
note is stale). The full beta/production runbook with versioning, release
notes, and compliance gates lives in **RELEASE.md**. Quick reference:

```bash
cd apps/mobile
./scripts/release-check.sh   # gates
./scripts/bump-build.sh      # version + tag
./scripts/archive.sh         # build/Loggi.xcarchive (+ env verification)
# then Xcode → Organizer → Distribute App
```

EAS remains a fallback only (see RELEASE.md §fallback).
```

- [ ] **Step 2: Verify no stale EAS-primary language remains**

Run: `grep -n "local CocoaPods hangs" SHIP.md; echo "exit=$?"`
Expected: no match, `exit=1`.

- [ ] **Step 3: Commit and push everything**

```bash
git add SHIP.md
git commit -m "ship: local-build release path replaces stale EAS-only instructions"
git push origin main --tags
```

---

## Self-review notes

- Spec coverage: CHANGELOG (T1), bump script (T2), release-check (T3),
  runbook incl. one-time blockers + smoke script + what-runs-when (T4),
  compliance checklist (T5), SHIP.md update (T6). The production-env
  pipeline (`archive.sh`, `.env.production`, eas.json cleanup) was
  implemented and committed before this plan — spec §"Artifacts" is
  otherwise fully covered.
- Gate 6 of release-check requires the CHANGELOG section for the CURRENT
  app.json version — consistent with Task 1 seeding `0.1.0` while
  app.json is at `0.1.0`.
- Tag format `v<version>-<build>` used identically in T2 (creation), T3
  (gate 5 parsing `sed 's/.*-//'`), and T4 (runbook).
```
