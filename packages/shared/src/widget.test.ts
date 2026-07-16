import { describe, expect, it } from "vitest";
import type { ApiMeal, Goals } from "./types";
import { widgetPayload } from "./widget";

const goals = {
  daily_calories: 2200,
  daily_protein_g: 140,
  daily_carbs_g: 220,
  daily_fat_g: 70,
} as Goals;

const meal = (id: string, calories: number, planned = false): ApiMeal =>
  ({
    id,
    eatenAt: "2026-07-15T12:00:00Z",
    name: "m",
    note: null,
    isFavorite: false,
    source: "photo",
    planned,
    createdAt: "2026-07-15T12:00:00Z",
    photos: [],
    items: [
      {
        id: `${id}-0`,
        mealId: id,
        name: "item",
        portion: "1",
        calories,
        proteinG: "10.4",
        carbsG: "20",
        fatG: "5",
        satFatG: null,
        fiberG: null,
        sugarG: null,
        sodiumMg: null,
      },
    ],
  }) as ApiMeal;

describe("widgetPayload", () => {
  it("sums eaten meals, excludes planned, rounds, carries goals and date", () => {
    const p = widgetPayload([meal("a", 500), meal("b", 300), meal("c", 999, true)], goals, "2026-07-15");
    expect(p).toEqual({
      date: "2026-07-15",
      calories: 800,
      caloriesGoal: 2200,
      protein: 21, // 10.4 * 2 rounded
      proteinGoal: 140,
      carbs: 40,
      carbsGoal: 220,
      fat: 10,
      fatGoal: 70,
    });
  });

  it("zero meals → zero totals", () => {
    const p = widgetPayload([], goals, "2026-07-15");
    expect(p.calories).toBe(0);
    expect(p.caloriesGoal).toBe(2200);
  });
});
