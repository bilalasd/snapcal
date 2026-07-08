// Extract SnapCal's 8 nutrients (per 100 g) from a USDA FoodData Central food.
// Works with both the /foods/search and /foods/list response shapes.

export interface UsdaFood {
  fdcId: number;
  description: string;
  foodCategory?: string | { description?: string };
  foodNutrients?: Array<{
    nutrientNumber?: string;
    number?: string;
    nutrientName?: string;
    name?: string;
    value?: number;
    amount?: number;
  }>;
}

export interface FoodRow {
  fdcId: number;
  description: string;
  category: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  satFatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

// USDA nutrient numbers
const N = {
  energyKcal: "208",
  protein: "203",
  fat: "204",
  carbs: "205",
  fiber: "291",
  sugar: "269",
  satFat: "606",
  sodium: "307",
} as const;

function nutrientValue(food: UsdaFood, number: string): number | null {
  const match = food.foodNutrients?.find(
    (n) => (n.nutrientNumber ?? n.number) === number,
  );
  const v = match?.value ?? match?.amount;
  return typeof v === "number" ? v : null;
}

/** Returns a FoodRow, or null if the food lacks the core macros. */
export function toFoodRow(food: UsdaFood): FoodRow | null {
  const calories = nutrientValue(food, N.energyKcal);
  const protein = nutrientValue(food, N.protein);
  const carbs = nutrientValue(food, N.carbs);
  const fat = nutrientValue(food, N.fat);
  if (calories === null || protein === null || carbs === null || fat === null) {
    return null;
  }
  const category =
    typeof food.foodCategory === "string"
      ? food.foodCategory
      : (food.foodCategory?.description ?? null);
  return {
    fdcId: food.fdcId,
    description: food.description,
    category,
    calories,
    proteinG: protein,
    carbsG: carbs,
    fatG: fat,
    satFatG: nutrientValue(food, N.satFat),
    fiberG: nutrientValue(food, N.fiber),
    sugarG: nutrientValue(food, N.sugar),
    sodiumMg: nutrientValue(food, N.sodium),
  };
}

/** Scale a per-100g food to a gram amount → a meal item's nutrition. */
export function foodToItem(
  food: {
    description: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    satFatG: number | null;
    fiberG: number | null;
    sugarG: number | null;
    sodiumMg: number | null;
  },
  grams: number,
) {
  const f = grams / 100;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const opt = (n: number | null) => (n === null ? null : r1(n * f));
  return {
    name: food.description,
    portion: `${grams} g`,
    calories: Math.round(food.calories * f),
    protein_g: r1(food.proteinG * f),
    carbs_g: r1(food.carbsG * f),
    fat_g: r1(food.fatG * f),
    sat_fat_g: opt(food.satFatG),
    fiber_g: opt(food.fiberG),
    sugar_g: opt(food.sugarG),
    sodium_mg: opt(food.sodiumMg),
  };
}
