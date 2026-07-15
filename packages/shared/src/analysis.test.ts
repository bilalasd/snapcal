import { describe, expect, it } from "vitest";
import { analysisSchema, scaleItem, scalePortion, sumItems } from "./analysis";

const item = {
  name: "Cooked rice",
  portion: "1 cup",
  estimated_grams: 158,
  confidence: "medium",
  calories: 205,
  protein_g: 4.3,
  carbs_g: 44.5,
  fat_g: 0.4,
  sat_fat_g: 0.1,
  fiber_g: 0.6,
  sugar_g: 0.1,
  sodium_mg: 2,
};

describe("scalePortion", () => {
  it("scales every number in the portion string", () => {
    expect(scalePortion("1 cup (1.5 oz)", 2)).toBe("2 cup (3 oz)");
    expect(scalePortion("2 rotis", 0.5)).toBe("1 rotis");
    expect(scalePortion("4 crackers total", 0.5)).toBe("2 crackers total");
  });

  it("leaves number-free portions untouched", () => {
    expect(scalePortion("a handful", 2)).toBe("a handful");
  });
});

describe("analysisSchema", () => {
  it("accepts a valid analysis", () => {
    const result = analysisSchema.safeParse({
      meal_name: "Rice bowl",
      items: [item],
      questions: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts questions with tappable options carrying full items", () => {
    const result = analysisSchema.safeParse({
      meal_name: "Chicken bowl",
      items: [item],
      questions: [
        {
          question: "Was the chicken fried or grilled?",
          options: [
            { label: "Fried", items: [item] },
            { label: "Grilled", items: [item] },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty item list", () => {
    expect(
      analysisSchema.safeParse({ meal_name: "Empty", items: [] }).success,
    ).toBe(false);
  });

  it("rejects negative calories", () => {
    expect(
      analysisSchema.safeParse({
        meal_name: "Bad",
        items: [{ ...item, calories: -100 }],
      }).success,
    ).toBe(false);
  });

  it("rejects non-integer calories", () => {
    expect(
      analysisSchema.safeParse({
        meal_name: "Bad",
        items: [{ ...item, calories: 205.5 }],
      }).success,
    ).toBe(false);
  });
});

describe("scaleItem", () => {
  it("halves every numeric field", () => {
    const half = scaleItem(item, 0.5);
    expect(half.calories).toBe(103); // rounded
    expect(half.protein_g).toBeCloseTo(2.2, 5); // rounded to 1dp
    expect(half.carbs_g).toBeCloseTo(22.3, 5);
    expect(half.name).toBe(item.name);
  });

  it("doubling then halving is ~identity", () => {
    const roundTrip = scaleItem(scaleItem(item, 2), 0.5);
    expect(roundTrip.calories).toBe(item.calories);
    expect(roundTrip.protein_g).toBeCloseTo(item.protein_g, 1);
  });
});

describe("sumItems", () => {
  it("sums an empty list to zeros", () => {
    expect(sumItems([])).toEqual({
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
  });

  it("sums multiple items with 1dp rounding", () => {
    const totals = sumItems([item, item]);
    expect(totals.calories).toBe(410);
    expect(totals.proteinG).toBeCloseTo(8.6, 5);
    expect(totals.carbsG).toBeCloseTo(89, 5);
  });
});
