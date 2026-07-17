# Honesty Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Monday note shows three numbers — logged intake, measured burn, a calculator's guess — plus one canned Bevi line naming the gap, computed read-time from the same week-frozen `weekBalance` that sets the adaptive goal.

**Architecture:** One pure function per concern in `packages/shared` (`computeFormulaTdee` composes the existing Mifflin-St Jeor helpers; `computeAuditStats` derives drift), an `audit` field on the existing `GET /api/trends` response, and a section in the existing `MondayNoteCard`. No migration, no cron changes, no LLM.

**Tech Stack:** Yarn 4 workspaces. Shared: TypeScript + vitest. API: Next.js route handlers + Drizzle. Mobile: Expo / React Native + NativeWind.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-honesty-report-design.md`.
- Drift = `formulaTdeeKcal − measuredTdeeKcal`, rounded to the **nearest 10**.
- Audit is null unless ALL hold: `weekVerdict.status !== "collecting"`, `weekBalance` non-null, `goalsRow.adaptiveGoal === true`, `computeFormulaTdee` non-null.
- Displayed figures come from `stats`/`audit` fields, never LLM text. Bevi lines are canned strings in the component.
- Copy uses "cal", not "kcal" (matches the card's existing "cal/day" voice).
- DESIGN.md must be updated in the same change as the UI (repo rule).
- Commit messages end with the repo's standard Co-Authored-By / Claude-Session trailer.

---

### Task 1: Shared math — `computeFormulaTdee` + `computeAuditStats`

**Files:**
- Modify: `packages/shared/src/bmr.ts` (append after `estimatedTdee`, ~line 72)
- Modify: `packages/shared/src/trend.ts` (append at end, after `computeVerdict`)
- Test: `packages/shared/src/bmr.test.ts`, `packages/shared/src/trend.test.ts`

**Interfaces:**
- Consumes: `bmrMifflinStJeor(sex, weightKg, heightCm, age)`, `estimatedTdee(bmr, activity)`, `ACTIVITY_LEVELS`, `EnergyBalance` — all existing in `@loggi/shared`.
- Produces (Task 2 and 3 rely on these exact names, auto-exported via the `export *` barrel in `packages/shared/src/index.ts` — no barrel edit needed):
  - `computeFormulaTdee(profile: TdeeProfile, weightKg: number): number | null`
  - `interface TdeeProfile { sex: string | null; age: number | null; heightCm: number | null; activityLevel: string | null }`
  - `interface AuditStats { avgIntakeKcal: number; measuredTdeeKcal: number; formulaTdeeKcal: number; driftKcal: number }`
  - `computeAuditStats(balance: EnergyBalance, formulaTdeeKcal: number): AuditStats`

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/src/bmr.test.ts` (add `computeFormulaTdee` to the existing import from `./bmr`):

```ts
describe("computeFormulaTdee", () => {
  const profile = {
    sex: "male",
    age: 30,
    heightCm: 180,
    activityLevel: "sedentary",
  };

  it("composes Mifflin-St Jeor × activity for a male profile", () => {
    // BMR = 10*80 + 6.25*180 − 5*30 + 5 = 1780; ×1.2 = 2136
    expect(computeFormulaTdee(profile, 80)).toBe(2136);
  });

  it("composes for a female profile", () => {
    // BMR = 10*65 + 6.25*165 − 5*40 − 161 = 1320.25 → 1320; ×1.55 = 2046
    expect(
      computeFormulaTdee(
        { sex: "female", age: 40, heightCm: 165, activityLevel: "moderate" },
        65,
      ),
    ).toBe(2046);
  });

  it("is null when any profile field is missing", () => {
    expect(computeFormulaTdee({ ...profile, sex: null }, 80)).toBeNull();
    expect(computeFormulaTdee({ ...profile, age: null }, 80)).toBeNull();
    expect(computeFormulaTdee({ ...profile, heightCm: null }, 80)).toBeNull();
    expect(
      computeFormulaTdee({ ...profile, activityLevel: null }, 80),
    ).toBeNull();
  });

  it("is null on unknown sex or activity strings", () => {
    expect(computeFormulaTdee({ ...profile, sex: "other" }, 80)).toBeNull();
    expect(
      computeFormulaTdee({ ...profile, activityLevel: "heroic" }, 80),
    ).toBeNull();
  });

  it("is null on non-positive weight, age, or height", () => {
    expect(computeFormulaTdee(profile, 0)).toBeNull();
    expect(computeFormulaTdee(profile, -70)).toBeNull();
    expect(computeFormulaTdee({ ...profile, age: 0 }, 80)).toBeNull();
    expect(computeFormulaTdee({ ...profile, heightCm: 0 }, 80)).toBeNull();
  });
});
```

Append to `packages/shared/src/trend.test.ts` (add `computeAuditStats` to the existing import from `./trend`):

```ts
describe("computeAuditStats", () => {
  const balance = {
    avgIntakeKcal: 1850,
    tdeeKcal: 2380,
    actualDeficitKcal: 530,
    loggedDays: 12,
    weighIns: 6,
    windowDays: 13,
  };

  it("passes figures through and rounds drift to the nearest 10", () => {
    const stats = computeAuditStats(balance, 2634);
    expect(stats).toEqual({
      avgIntakeKcal: 1850,
      measuredTdeeKcal: 2380,
      formulaTdeeKcal: 2634,
      driftKcal: 250, // 2634 − 2380 = 254 → 250
    });
  });

  it("drift is negative when the formula underestimates the measured burn", () => {
    expect(computeAuditStats(balance, 2196).driftKcal).toBe(-180);
    // 2196 − 2380 = −184 → −180
  });

  it("keeps small agreement gaps honest instead of zeroing them", () => {
    expect(computeAuditStats(balance, 2420).driftKcal).toBe(40);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn shared test`
Expected: FAIL — `computeFormulaTdee is not a function` / `computeAuditStats is not a function` (or import errors), existing suites still pass.

- [ ] **Step 3: Write the implementations**

Append to `packages/shared/src/bmr.ts`:

```ts
export interface TdeeProfile {
  sex: string | null;
  age: number | null;
  heightCm: number | null;
  activityLevel: string | null;
}

/**
 * Formula TDEE from a stored (nullable) profile, for the Monday-note audit.
 * Null whenever the profile can't support an estimate — callers hide the
 * audit rather than guess.
 */
export function computeFormulaTdee(
  profile: TdeeProfile,
  weightKg: number,
): number | null {
  const { sex, age, heightCm, activityLevel } = profile;
  if (sex !== "male" && sex !== "female") return null;
  if (!age || age <= 0 || !heightCm || heightCm <= 0 || !(weightKg > 0)) {
    return null;
  }
  const level = ACTIVITY_LEVELS.find((l) => l.value === activityLevel);
  if (!level) return null;
  return estimatedTdee(bmrMifflinStJeor(sex, weightKg, heightCm, age), level.value);
}
```

Append to `packages/shared/src/trend.ts`:

```ts
export interface AuditStats {
  avgIntakeKcal: number;
  measuredTdeeKcal: number;
  formulaTdeeKcal: number;
  /** formula − measured, rounded to the nearest 10. */
  driftKcal: number;
}

/** The Monday-note audit: logged vs measured vs formula (spec 2026-07-16). */
export function computeAuditStats(
  balance: EnergyBalance,
  formulaTdeeKcal: number,
): AuditStats {
  return {
    avgIntakeKcal: balance.avgIntakeKcal,
    measuredTdeeKcal: balance.tdeeKcal,
    formulaTdeeKcal,
    driftKcal: Math.round((formulaTdeeKcal - balance.tdeeKcal) / 10) * 10,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn shared test`
Expected: PASS (all suites, including the two new describes).

Run: `yarn shared typecheck`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/bmr.ts packages/shared/src/bmr.test.ts packages/shared/src/trend.ts packages/shared/src/trend.test.ts
git commit -m "shared: computeFormulaTdee + computeAuditStats for the Monday-note audit"
```

---

### Task 2: API — `audit` field on `GET /api/trends`

**Files:**
- Modify: `apps/api/src/app/api/trends/route.ts`

**Interfaces:**
- Consumes: `computeFormulaTdee`, `computeAuditStats`, `type AuditStats` from `@loggi/shared` (Task 1); existing route locals `goalsRow`, `trendAsOfWeek`, `weekBalance`, `weekVerdict`.
- Produces: response JSON gains `audit: AuditStats | null` — the exact key Task 3's mobile type reads.

- [ ] **Step 1: Import the new helpers**

In `apps/api/src/app/api/trends/route.ts`, extend the existing `@loggi/shared` import block (lines 5–12) with `computeAuditStats` and `computeFormulaTdee`:

```ts
import {
  computeAuditStats,
  computeEnergyBalance,
  computeFormulaTdee,
  computeRateKgPerWeek,
  computeTrend,
  computeVerdict,
  type DayIntake,
  type WeightPoint,
} from "@loggi/shared";
```

- [ ] **Step 2: Compute the audit after the adaptive goal**

Insert directly after the `adaptiveGoalKcal` computation (after line 115, before `chartStart`):

```ts
  // The audit (Monday-note honesty report): logged vs measured vs formula,
  // from the SAME week-frozen balance the adaptive goal used — so "your
  // target used the measured number" is the same computation, not a claim.
  const lastWeekTrend = trendAsOfWeek[trendAsOfWeek.length - 1];
  const formulaTdee =
    goalsRow?.adaptiveGoal &&
    weekVerdict.status !== "collecting" &&
    weekBalance &&
    lastWeekTrend
      ? computeFormulaTdee(
          {
            sex: goalsRow.sex,
            age: goalsRow.age,
            heightCm: goalsRow.heightCm == null ? null : Number(goalsRow.heightCm),
            activityLevel: goalsRow.activityLevel,
          },
          lastWeekTrend.trendKg,
        )
      : null;
  const audit =
    formulaTdee != null && weekBalance
      ? computeAuditStats(weekBalance, formulaTdee)
      : null;
```

- [ ] **Step 3: Return it**

In the `NextResponse.json({...})` object, add one line after `adaptive_goal_kcal`:

```ts
    adaptive_goal_kcal: adaptiveGoalKcal,
    audit,
```

- [ ] **Step 4: Verify — tests and a type-checked build**

Run: `yarn api test`
Expected: PASS (existing suites; none cover this route).

Run: `yarn api build`
Expected: compiles with type checking, no errors. (Requires no env; if `next build` demands env vars locally, `cd apps/api && npx tsc --noEmit` is the fallback type gate.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/api/trends/route.ts
git commit -m "api: trends returns audit — logged vs measured vs formula burn"
```

---

### Task 3: Mobile — THE AUDIT section in the Monday note card (+ DESIGN.md)

**Files:**
- Modify: `apps/mobile/components/monday-note-card.tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx` (Trends type ~line 59; MondayNoteCard call site ~line 343)
- Modify: `DESIGN.md` (Monday note card row, line 194)

**Interfaces:**
- Consumes: `audit: AuditStats | null` from `/api/trends` (Task 2); `type AuditStats` from `@loggi/shared`; existing `Kicker`, `Card` UI primitives.
- Produces: `MondayNote` interface gains `audit: AuditStats | null` — parent must pass it.

- [ ] **Step 1: Extend the MondayNote interface and render the section**

In `apps/mobile/components/monday-note-card.tsx`:

Add the import at the top:

```ts
import type { AuditStats } from "@loggi/shared";
```

Extend the interface:

```ts
export interface MondayNote {
  weekStart: string;
  content: string;
  verdictStatus: "collecting" | "on_track" | "adjust";
  /** This week's adaptive goal, null when the smart goal is off/unavailable. */
  goalKcal: number | null;
  /** Logged vs measured vs formula burn; null when guards fail (see spec). */
  audit: AuditStats | null;
}
```

Insert the section between the recap prose (`<Text className="mt-2 text-sm text-black">{note.content}</Text>`) and the notification-offer block:

```tsx
      {note.audit ? (
        <View className="mt-3 border-t border-black/15 pt-3">
          <Kicker className="text-black/60">The audit</Kicker>
          <View className="mt-2 flex-row gap-3">
            {(
              [
                [note.audit.avgIntakeKcal, "Logged"],
                [note.audit.measuredTdeeKcal, "Your burn, measured"],
                [note.audit.formulaTdeeKcal, "Calculator's guess"],
              ] as const
            ).map(([value, label]) => (
              <View key={label} className="flex-1">
                <Text className="text-lg font-black tracking-tight text-black">
                  {value.toLocaleString()}
                </Text>
                <Text className="text-[11px] font-semibold text-black/60">{label}</Text>
              </View>
            ))}
          </View>
          <Text className="mt-2 text-xs text-black">
            {Math.abs(note.audit.driftKcal) >= 100
              ? `A calculator would've missed your burn by ~${Math.abs(
                  note.audit.driftKcal,
                ).toLocaleString()} cal/day. Could be portions, could be the formula — either way, your target used the measured number.`
              : "Your logs and your scale agree within 100 cal. Tight bookkeeping."}
          </Text>
        </View>
      ) : null}
```

- [ ] **Step 2: Wire the data through Today**

In `apps/mobile/app/(tabs)/index.tsx`:

Add to the imports from `@loggi/shared` (there is an existing import — extend it; if only value imports exist, add `type AuditStats` to it):

```ts
import type { AuditStats } from "@loggi/shared";
```

Extend the local `Trends` type (~line 59) with the new field:

```ts
  audit: AuditStats | null;
```

At the `MondayNoteCard` call site (~line 343), add to the `note` object after `goalKcal`:

```ts
  audit: trends.audit ?? null,
```

(The `?? null` keeps the app safe against a stale cached API response without the field.)

- [ ] **Step 3: Update DESIGN.md in the same change**

In the component table row for **Monday note card** (line 194), extend the description after "recap prose." with:

```
"THE AUDIT" section when the smart goal is on and the week has enough data:
three figures (Logged / Your burn, measured / Calculator's guess) over one
canned Bevi line — drift ≥100 cal names the gap ("could be portions, could
be the formula — your target used the measured number"), <100 cal says
"Tight bookkeeping."
```

- [ ] **Step 4: Typecheck and visually verify**

Run: `yarn mobile typecheck`
Expected: clean exit.

Then use the `apps/mobile:verify` skill to launch the app and confirm: with an adaptive-goal account that has a recap, the Monday note shows THE AUDIT section with three figures and the Bevi line; with the smart goal off (or thin data), the card renders exactly as before, no empty section.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/monday-note-card.tsx "apps/mobile/app/(tabs)/index.tsx" DESIGN.md
git commit -m "mobile: THE AUDIT in the Monday note — logged vs measured vs formula"
```
