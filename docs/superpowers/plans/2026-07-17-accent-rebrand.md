# Accent Rebrand (magenta → vermilion `accent-log`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brand accent `#ff3d8b` (magenta) with `#e64a19` (vermilion) as a renamed semantic token `accent-log`, in the app and DESIGN.md atomically.

**Architecture:** Pure token rename + hex swap. One Tailwind token becomes an 11-shade scale with `DEFAULT`; five call sites rename a class; DESIGN.md updates in the same commit (AGENTS.md sync rule). No component, layout, or behavior changes.

**Tech Stack:** Expo/React Native, NativeWind (Tailwind v3-style `tailwind.config.js`), no test framework in `apps/mobile`.

**Spec:** `docs/superpowers/specs/2026-07-17-accent-rebrand-design.md`

## Global Constraints

- New accent: `#e64a19`. Token name: `accent-log` (class `bg-accent-log`). Old `#ff3d8b` / `magenta` must not survive anywhere in `apps/mobile` or `DESIGN.md`.
- Text on an accent fill uses shade 600 `#b83a14` — 500 is UI-color only (no text sits on the accent today; this is a documented rule, not a code change).
- Destructive stays `#d92d20` / `#f97066`. Bevi PNGs, app icon, `apps/api/figma/DESIGN.md`, and `AUDIT.md` are untouched.
- **The working tree has many unrelated modified files. Stage ONLY the six files this plan names. Never `git add -A` or `git add .`**
- App + DESIGN.md changes land in ONE commit (AGENTS.md: design changes and DESIGN.md sync in the same change).

---

### Task 1: Rename token, call sites, and DESIGN.md — single atomic commit

**Files:**
- Modify: `apps/mobile/tailwind.config.js` (~line 22)
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (3 class usages)
- Modify: `apps/mobile/components/speak-capture.tsx` (1 class usage)
- Modify: `apps/mobile/app/(tabs)/index.tsx` (1 class usage)
- Modify: `apps/mobile/global.css` (comment only, lines 8–10)
- Modify: `DESIGN.md` (8 locations)

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind token `accent-log` (object with shades 50–950 and `DEFAULT: "#e64a19"`); class `bg-accent-log` used at 5 call sites. Task 2 verifies these exact names.

- [ ] **Step 1: Replace the token in `apps/mobile/tailwind.config.js`**

Old (single line, the only `magenta` in the file):

```js
        magenta: "#ff3d8b", // shared across themes: 5.9:1 on dark, brand accent
```

New (same position/indent):

```js
        "accent-log": {
          50: "#fcf5f2",
          100: "#f9eae6",
          200: "#f4d2c7",
          300: "#eda791",
          400: "#e87754",
          500: "#e64a19",
          600: "#b83a14", // text-on-accent shade: 5.8:1 on white
          700: "#973011",
          800: "#7c270e",
          900: "#5c1d0a",
          950: "#2e0f05",
          DEFAULT: "#e64a19", // shared across themes: 5.0:1 on dark, brand accent
        },
```

- [ ] **Step 2: Rename the class in the three component files**

In each file, replace ALL occurrences of `bg-magenta` with `bg-accent-log` (use Edit with `replace_all: true`, old_string `bg-magenta`, new_string `bg-accent-log`):

- `apps/mobile/app/(tabs)/_layout.tsx` — 3 occurrences (listening dot ~263, speed-dial circles ~289, FAB ~316)
- `apps/mobile/components/speak-capture.tsx` — 1 occurrence (recording dot ~139)
- `apps/mobile/app/(tabs)/index.tsx` — 1 occurrence (streak badge ~319)

No other attribute, size, or glyph changes — icon `color="#fff"` props stay.

- [ ] **Step 3: Reword the `apps/mobile/global.css` header comment**

Old (lines 8–10):

```css
   inversions: near-black base (no pure #000 → OLED smear), off-white text,
   lightened destructive so it clears 4.5:1 on dark. Magenta #ff3d8b is shared —
   it reads 5.9:1 on the dark base. */
```

New:

```css
   inversions: near-black base (no pure #000 → OLED smear), off-white text,
   lightened destructive so it clears 4.5:1 on dark. Accent (accent-log)
   #e64a19 is shared — it reads 5.0:1 on the dark base. */
```

- [ ] **Step 4: Update DESIGN.md — 8 exact edits**

4a. Theme prompt (§2, ~lines 50–51). Old:

```
> **Theme prompt:** "Stark black-and-white editorial layout with one loud
> magenta accent. Heavy black display type, tightly tracked, uppercase kickers.
```

New:

```
> **Theme prompt:** "Stark black-and-white editorial layout with one loud
> vermilion accent. Heavy black display type, tightly tracked, uppercase kickers.
```

4b. Discipline bullet (§2.1, ~lines 59–61). Old:

```
- **Magenta discipline:** `#ff3d8b` is reserved for the logging entry points —
  the floating "+" button and its speed-dial actions. It is the "log something"
  color; it never decorates.
```

New:

```
- **Accent discipline:** vermilion `#e64a19` (`accent-log`) is reserved for the
  logging entry points — the floating "+" button and its speed-dial actions. It
  is the "log something" color; it never decorates.
```

4c. Bevi rule (§2.1, ~lines 66–68). Old:

```
  at moments that matter (PRODUCT.md §4). Bevi never sits on or in front of a
  magenta surface — poses go on neutral or pastel grounds only; the warm
  mascot and the loud accent stay apart.
```

New:

```
  at moments that matter (PRODUCT.md §4). Bevi never sits on or in front of an
  accent-log surface — poses go on neutral or pastel grounds only; the accent
  is the same warm family as the fur, and layering them smears both.
```

4d. Light table row (§2.2, ~line 92). Old:

```
| Magenta | `magenta` (static) | `#ff3d8b` | The "+" log button + speed dial only |
```

New:

```
| Accent | `accent-log` (static) | `#e64a19` | Logging entry points ("+" FAB, speed dial), capture-state dots, streak badge |
```

4e. Dark table row (§2.2, ~line 107). Old:

```
| Magenta | `#ff3d8b` (shared) | 5.9:1 |
```

New:

```
| Accent | `#e64a19` (shared) | 5.0:1 |
```

4f. Contrast rules (§2.2, ~lines 120–122). Old:

```
**Contrast rules (WCAG AA):** text ≥4.5:1, secondary text ≥3:1, chart
geometry ≥3:1 — verified light **and** dark independently. Magenta passes as
an accent/UI color in both (3.3:1 light, 5.9:1 dark) but is not body-text.
```

New:

```
**Contrast rules (WCAG AA):** text ≥4.5:1, secondary text ≥3:1, chart
geometry ≥3:1 — verified light **and** dark independently. The accent passes
as a UI color in both (3.9:1 light, 5.0:1 dark) but is not body-text; text on
an accent fill uses shade 600 `#b83a14` (5.8:1 on white).
```

4g. App icon (§2.9, ~lines 184–186). Old:

```
full-bleed lime block (`#dceeb1`, the Today-hero/widget color). No magenta —
`#ff3d8b` stays reserved for in-app logging entry points (§2.1) and never
decorates the icon. No type, no gradients, no shadows outside the artwork
```

New:

```
full-bleed lime block (`#dceeb1`, the Today-hero/widget color). No accent —
`#e64a19` stays reserved for in-app logging entry points (§2.1) and never
decorates the icon. No type, no gradients, no shadows outside the artwork
```

4h. Speed dial component row (§3, ~line 199): in the row starting
`| **Speed dial ("+")** |`, replace the substring `76px magenta FAB` with
`76px vermilion FAB`. Rest of the row unchanged.

- [ ] **Step 5: Verify zero survivors, correct call-site count**

Run:

```bash
grep -rin 'ff3d8b\|magenta' apps/mobile DESIGN.md
```

Expected: no output (exit 1).

```bash
grep -rc 'bg-accent-log' 'apps/mobile/app/(tabs)/_layout.tsx' apps/mobile/components/speak-capture.tsx 'apps/mobile/app/(tabs)/index.tsx'
```

Expected: `3`, `1`, `1` respectively.

- [ ] **Step 6: Commit (the six files only)**

```bash
git add apps/mobile/tailwind.config.js 'apps/mobile/app/(tabs)/_layout.tsx' apps/mobile/components/speak-capture.tsx 'apps/mobile/app/(tabs)/index.tsx' apps/mobile/global.css DESIGN.md
git commit -m "mobile: rebrand accent magenta → vermilion accent-log token (DESIGN.md synced)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Then `git status` — confirm none of the other dirty files were swept in.

---

### Task 2: Verification — contrast baseline and live visual check

**Files:**
- No file changes expected. Fix-forward in the Task 1 files only if a check fails.

**Interfaces:**
- Consumes: token `accent-log` and class `bg-accent-log` from Task 1.
- Produces: verified claims backing DESIGN.md's numbers.

- [ ] **Step 1: Re-verify the four documented contrast ratios**

Run:

```bash
node -e '
function lum(h){h=h.replace(/^#/,"");const f=c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);return .2126*f(parseInt(h.slice(0,2),16)/255)+.7152*f(parseInt(h.slice(2,4),16)/255)+.0722*f(parseInt(h.slice(4,6),16)/255)}
const R=(a,b)=>{const x=lum(a),y=lum(b);return((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
console.log("500 on white:", R("#e64a19","#ffffff"), "(want 3.92)");
console.log("500 on dark:", R("#e64a19","#0c0c0c"), "(want 4.99)");
console.log("white glyph on 500:", R("#ffffff","#e64a19"), "(want 3.92)");
console.log("white text on 600:", R("#ffffff","#b83a14"), "(want 5.75)");'
```

Expected output: exactly the four "want" values. These back DESIGN.md's
"3.9:1 light, 5.0:1 dark" and "600 = 5.8:1" claims.

- [ ] **Step 2: Visual check in the running app**

Invoke the project skill `apps/mobile:verify` (Skill tool) and follow it to
launch the app. Confirm, in BOTH light and dark mode:

- The "+" FAB and speed-dial circles render vermilion `#e64a19` (warm
  orange-red, clearly not pink), white glyphs legible.
- The listening/recording dots and the Today streak badge render vermilion.
- Nothing else changed color (destructive red still distinct in error/over-target states).

Expected: all five accent surfaces vermilion; no stray magenta anywhere in
the UI.

- [ ] **Step 3: If any check failed**

Fix in the Task 1 files, re-run Task 1 Step 5 + both checks above, and amend:
`git commit --amend --no-edit` (only if the Task 1 commit is still HEAD and
unpushed; otherwise a follow-up `fix:` commit).

---

## Self-review notes

- Spec coverage: spec §1→Task 1 Step 1; §2→Step 2; §3→Step 3; §4→Step 4 (8
  edits incl. the §2.9 icon paragraph added to DESIGN.md after the spec was
  written — covered here as 4g); §5 locked defaults→no-op by design;
  measured-contrast table→Task 2 Step 1; verification→Task 1 Step 5 + Task 2.
- The spec's "5 call sites" and this plan's per-file `replace_all` agree: 3+1+1.
- One commit for app+doc honors AGENTS.md; Task 2 makes no commit.
