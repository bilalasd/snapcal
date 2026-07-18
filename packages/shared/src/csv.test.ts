import { describe, expect, it } from "vitest";
import { csvField, mealsCsv } from "./csv";
import type { ApiMeal } from "./types";

const item = (over: Partial<ApiMeal["items"][number]> = {}): ApiMeal["items"][number] => ({
  id: "i1",
  mealId: "m1",
  name: "Rice",
  portion: "1 cup",
  calories: 200,
  proteinG: "4.0",
  carbsG: "45.0",
  fatG: "0.5",
  satFatG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
  ...over,
});

const meal = (over: Partial<ApiMeal> = {}): ApiMeal => ({
  id: "m1",
  eatenAt: "2026-07-16T12:30:00.000Z",
  name: "Lunch",
  note: null,
  isFavorite: false,
  source: "photo",
  planned: false,
  createdAt: "2026-07-16T12:30:00.000Z",
  items: [item()],
  photos: [],
  ...over,
});

describe("csvField", () => {
  it("passes plain values through", () => {
    expect(csvField("Rice")).toBe("Rice");
    expect(csvField(42)).toBe("42");
  });
  it("quotes commas, quotes, and newlines", () => {
    expect(csvField("rice, fried")).toBe('"rice, fried"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });
});

describe("mealsCsv", () => {
  it("emits a header plus one row per item, oldest first", () => {
    const csv = mealsCsv([
      meal({ id: "m2", eatenAt: "2026-07-16T18:00:00.000Z", name: "Dinner, big", items: [item({ name: "Pasta" })] }),
      meal({ items: [item(), item({ name: "Chicken" })] }),
    ]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("date,time,meal,item,portion,calories,protein_g,carbs_g,fat_g,planned,source");
    expect(lines[1]).toContain("Lunch,Rice");
    expect(lines[2]).toContain("Lunch,Chicken");
    expect(lines[3]).toContain('"Dinner, big",Pasta');
    expect(lines[1]).toContain(",false,photo");
  });
});
