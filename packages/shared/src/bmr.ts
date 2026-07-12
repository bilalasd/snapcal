/**
 * BMR / TDEE estimation (Mifflin-St Jeor) and calorie-target suggestion.
 * Pure functions — unit-tested. Distinct from the *measured* TDEE on the
 * Trends screen, which is derived from actual intake + weight change; this
 * is the formula-based starting point.
 */

export type Sex = "male" | "female";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export const ACTIVITY_LEVELS: Array<{
  value: ActivityLevel;
  label: string;
  description: string;
  multiplier: number;
}> = [
  {
    value: "sedentary",
    label: "Sedentary",
    description: "Desk job, little exercise",
    multiplier: 1.2,
  },
  {
    value: "light",
    label: "Lightly active",
    description: "Exercise 1–3 days/week",
    multiplier: 1.375,
  },
  {
    value: "moderate",
    label: "Moderately active",
    description: "Exercise 3–5 days/week",
    multiplier: 1.55,
  },
  {
    value: "active",
    label: "Very active",
    description: "Hard exercise 6–7 days/week",
    multiplier: 1.725,
  },
  {
    value: "very_active",
    label: "Extremely active",
    description: "Physical job + hard training",
    multiplier: 1.9,
  },
];

const KCAL_PER_KG = 7700;

/** Mifflin-St Jeor basal metabolic rate, kcal/day. */
export function bmrMifflinStJeor(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

/** Formula-estimated maintenance calories. */
export function estimatedTdee(bmr: number, activity: ActivityLevel): number {
  const level = ACTIVITY_LEVELS.find((l) => l.value === activity);
  return Math.round(bmr * (level?.multiplier ?? 1.2));
}

/** Daily deficit (positive) or surplus (negative) needed for a kg/week rate. */
export function deficitForRate(targetRateKgPerWk: number): number {
  // + 0 normalizes -0 (from rounding a tiny negative) to +0
  return Math.round((-targetRateKgPerWk * KCAL_PER_KG) / 7) + 0;
}

/**
 * Suggested daily intake for a target rate, floored at a safe minimum
 * (never suggest eating below ~BMR × 0.85 or 1200 kcal, whichever is higher).
 */
export function suggestedIntake(
  tdee: number,
  bmr: number,
  targetRateKgPerWk: number,
): { intake: number; floored: boolean } {
  const raw = tdee - deficitForRate(targetRateKgPerWk);
  const floor = Math.max(1200, Math.round(bmr * 0.85));
  if (raw < floor) return { intake: floor, floored: true };
  return { intake: raw, floored: false };
}

/**
 * Sensible macro *targets* for a calorie goal:
 *   - Protein: 1.6 g per kg of bodyweight (a common evidence-based intake for
 *     people who are active or losing weight — enough to preserve muscle).
 *   - Fat: 30% of total calories, at 9 kcal/g.
 *   - Carbs: whatever calories remain, at 4 kcal/g.
 * These are the daily *goals*. A logged meal's macros are separate — those come
 * from Claude's per-item estimate in /api/analyze, not this formula.
 */
export function suggestedMacros(
  calories: number,
  weightKg: number,
): { protein_g: number; carbs_g: number; fat_g: number } {
  const protein = Math.round(1.6 * weightKg);
  const fat = Math.round((calories * 0.3) / 9);
  const carbs = Math.max(
    0,
    Math.round((calories - protein * 4 - fat * 9) / 4),
  );
  return { protein_g: protein, carbs_g: carbs, fat_g: fat };
}

export interface MacroPercents {
  protein_pct: number;
  carbs_pct: number;
  fat_pct: number;
}

/** Percent of calories each macro target represents (4/4/9 kcal per gram). */
export function macroPercents(
  calories: number,
  grams: { protein_g: number; carbs_g: number; fat_g: number },
): MacroPercents {
  if (calories <= 0) return { protein_pct: 0, carbs_pct: 0, fat_pct: 0 };
  const protein = Math.round(((grams.protein_g * 4) / calories) * 100);
  const fat = Math.round(((grams.fat_g * 9) / calories) * 100);
  const carbs = Math.max(0, 100 - protein - fat);
  return { protein_pct: protein, carbs_pct: carbs, fat_pct: fat };
}

/** Gram targets from a percent split of a calorie goal. */
export function gramsFromPercents(
  calories: number,
  pcts: MacroPercents,
): { protein_g: number; carbs_g: number; fat_g: number } {
  return {
    protein_g: Math.round((calories * pcts.protein_pct) / 100 / 4),
    carbs_g: Math.round((calories * pcts.carbs_pct) / 100 / 4),
    fat_g: Math.round((calories * pcts.fat_pct) / 100 / 9),
  };
}
