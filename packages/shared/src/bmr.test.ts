import { describe, expect, it } from "vitest";
import {
  bmrMifflinStJeor,
  deficitForRate,
  estimatedTdee,
  gramsFromPercents,
  macroPercents,
  suggestedIntake,
  suggestedMacros,
} from "./bmr";

describe("bmrMifflinStJeor", () => {
  it("matches the reference formula for a male", () => {
    // 10×80 + 6.25×178 − 5×30 + 5 = 800 + 1112.5 − 150 + 5 = 1767.5 → 1768
    expect(bmrMifflinStJeor("male", 80, 178, 30)).toBe(1768);
  });

  it("matches the reference formula for a female", () => {
    // 10×65 + 6.25×165 − 5×28 − 161 = 650 + 1031.25 − 140 − 161 = 1380.25 → 1380
    expect(bmrMifflinStJeor("female", 65, 165, 28)).toBe(1380);
  });

  it("male BMR exceeds female BMR at equal stats", () => {
    expect(bmrMifflinStJeor("male", 70, 170, 35)).toBe(
      bmrMifflinStJeor("female", 70, 170, 35) + 166,
    );
  });
});

describe("estimatedTdee", () => {
  it("applies the sedentary multiplier", () => {
    expect(estimatedTdee(1768, "sedentary")).toBe(Math.round(1768 * 1.2));
  });

  it("applies the very_active multiplier", () => {
    expect(estimatedTdee(1768, "very_active")).toBe(Math.round(1768 * 1.9));
  });
});

describe("deficitForRate", () => {
  it("losing 0.5 kg/week needs a ~550 kcal/day deficit", () => {
    expect(deficitForRate(-0.5)).toBe(550);
  });

  it("gaining 0.25 kg/week needs a ~275 kcal/day surplus", () => {
    expect(deficitForRate(0.25)).toBe(-275);
  });

  it("maintenance needs zero", () => {
    expect(deficitForRate(0)).toBe(0);
  });
});

describe("suggestedIntake", () => {
  it("subtracts the deficit from TDEE", () => {
    const { intake, floored } = suggestedIntake(2500, 1700, -0.5);
    expect(intake).toBe(1950);
    expect(floored).toBe(false);
  });

  it("adds a surplus for gaining goals", () => {
    const { intake } = suggestedIntake(2500, 1700, 0.25);
    expect(intake).toBe(2775);
  });

  it("floors aggressive deficits at 85% of BMR", () => {
    // TDEE 1900, target −1 kg/wk → raw 800; floor = max(1200, 0.85×1600=1360)
    const { intake, floored } = suggestedIntake(1900, 1600, -1);
    expect(intake).toBe(1360);
    expect(floored).toBe(true);
  });

  it("never suggests below 1200 kcal", () => {
    const { intake } = suggestedIntake(1300, 1250, -1);
    expect(intake).toBeGreaterThanOrEqual(1200);
  });
});

describe("suggestedMacros", () => {
  it("protein is 1.6 g/kg bodyweight", () => {
    const m = suggestedMacros(2000, 80);
    expect(m.protein_g).toBe(128);
  });

  it("macros roughly reconstruct the calorie total", () => {
    const m = suggestedMacros(2000, 80);
    const kcal = m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
    expect(Math.abs(kcal - 2000)).toBeLessThan(20); // rounding slack
  });
});

describe("macroPercents / gramsFromPercents", () => {
  it("percents sum to 100", () => {
    const p = macroPercents(2000, { protein_g: 150, carbs_g: 200, fat_g: 67 });
    expect(p.protein_pct + p.carbs_pct + p.fat_pct).toBe(100);
  });

  it("round-trips percents to grams and back", () => {
    const grams = gramsFromPercents(2000, {
      protein_pct: 30,
      carbs_pct: 40,
      fat_pct: 30,
    });
    // 30% of 2000 = 600 kcal / 4 = 150g protein; 40%/4 = 200g carbs; 30%/9 ≈ 67g fat
    expect(grams.protein_g).toBe(150);
    expect(grams.carbs_g).toBe(200);
    expect(grams.fat_g).toBe(67);
  });

  it("handles zero calories without dividing by zero", () => {
    expect(macroPercents(0, { protein_g: 0, carbs_g: 0, fat_g: 0 })).toEqual({
      protein_pct: 0,
      carbs_pct: 0,
      fat_pct: 0,
    });
  });
});
