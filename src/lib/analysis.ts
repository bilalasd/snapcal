import { z } from "zod";

export const analyzedItemSchema = z.object({
  name: z.string(),
  portion: z.string(),
  calories: z.number().int().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
});

export const analysisSchema = z.object({
  meal_name: z.string(),
  items: z.array(analyzedItemSchema).min(1),
});

export type AnalyzedItem = z.infer<typeof analyzedItemSchema>;
export type Analysis = z.infer<typeof analysisSchema>;

/** Scale every numeric field of an item by `factor` (the ×½ / ×2 buttons). */
export function scaleItem(item: AnalyzedItem, factor: number): AnalyzedItem {
  return {
    ...item,
    calories: Math.round(item.calories * factor),
    protein_g: round1(item.protein_g * factor),
    carbs_g: round1(item.carbs_g * factor),
    fat_g: round1(item.fat_g * factor),
  };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface MealTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function sumItems(
  items: Array<{
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>,
): MealTotals {
  return items.reduce<MealTotals>(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      proteinG: round1(acc.proteinG + item.protein_g),
      carbsG: round1(acc.carbsG + item.carbs_g),
      fatG: round1(acc.fatG + item.fat_g),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}
