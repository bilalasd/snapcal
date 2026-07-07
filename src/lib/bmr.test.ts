import { describe, expect, it } from "vitest";
import {
  bmrMifflinStJeor,
  deficitForRate,
  estimatedTdee,
  suggestedIntake,
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
