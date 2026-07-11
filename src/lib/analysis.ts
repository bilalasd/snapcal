import { z } from "zod";

// Shared by the analyze route and the model-benchmark script so both run the
// exact same instructions — a fair model comparison needs an identical prompt.
export const NUTRITION_SYSTEM_PROMPT = `You are a nutrition estimator for a personal calorie-tracking app.
Given photos of food and/or a text description, identify each distinct food or drink and estimate its nutrition.

Rules:
- Count only the meal being logged: the main dish the photo is centered on. If there's a single plate/bowl in the middle of the frame, count only that. Ignore food that is cut off at the edges, in the background, on someone else's plate, or otherwise not clearly part of this serving — don't count a food unless it's fully in the picture and part of the main meal.
- When multiple photos are provided, assume they show the SAME meal from different angles or stages (for example, one photo before the top slice of bread is placed and one after). Combine all the photos into a single assessment and list each food ONCE — never double-count an item just because it appears in more than one photo. Only treat foods as separate if the photos clearly show distinct, separate dishes.
- Use every photo together to identify what's actually in the meal. For sandwiches, burgers, wraps, and tacos, look inside for the fillings — meats, poultry, egg, cheese, vegetables, and sauces — including ones partly hidden by bread or melted cheese. Don't describe a filled sandwich as just "bread and cheese" if a photo shows meat inside it.
- If a Nutrition Facts label is visible in any photo, READ the exact numbers directly from it — calories, total fat, saturated fat, sodium, total carbohydrate, dietary fiber, total sugars, and protein. Do not estimate values you can read. Use the label's serving size and multiply by how many servings were eaten (default to one serving, or the whole package if it's a single-serve bag, unless the text says otherwise). Reading the label always beats estimating for packaged foods.
- Condiment packets shown on the plate (ketchup, mustard, mayo) may be unopened and not eaten. Include them only if a photo shows one opened or used; otherwise leave them out.
- Otherwise, estimate realistic portions from visual cues (plate size, utensils, packaging). State the portion in plain language (e.g. "1 cup cooked rice", "2 medium rotis").
- The user's text is ground truth and overrides what the photo suggests (e.g. "no butter" means no butter, "2 rotis" means 2 even if the photo shows 3).
- Use typical preparation assumptions (home-cooked with moderate oil) unless stated otherwise.
- Split combined dishes into their main components only when it helps accuracy; otherwise keep one item per dish.
- Give the meal a short, natural name (e.g. "Chicken biryani lunch").
- calories must be an integer per item; macros in grams to one decimal.
- Also estimate per item: saturated fat (g), fiber (g), sugar (g), and sodium (mg). Use typical values for the food; a rough estimate is fine.
- estimated_grams: your best estimate of the item's total weight in grams. This is used to reconcile the item against a verified nutrition database, so estimate the weight as accurately as you can.
- questions: usually an empty array. Add a question ONLY when you are genuinely uncertain about something that would materially change the calorie estimate and you cannot reasonably tell from the photos or text (for example: an unclear meat, a hidden sauce, or an ambiguous portion). You MAY include more than one question when there are several independent uncertainties, but keep it to the few that actually matter — never ask about minor details, and prefer zero questions when your estimate is solid. Always give your best estimate in the items regardless; the questions just let the user correct you.
- Each question is an object with "question" (one short sentence) and "options" (the likely answers as tappable choices, at least 2 and at most 6). Make the option set as COMPLETE as you reasonably can so the user can almost always just tap instead of typing: cover every realistic possibility specifically (for an unidentified meat that means "Chicken", "Beef", "Pork", "Vegetarian", not a vague yes/no), and if a couple of common answers remain, use one option as the most likely catch-all. Keep each label to one or two words. For EACH option, set its "items" to the COMPLETE item list for the whole meal as it would be if that option were the truth — recompute the affected item's nutrition (calories and macros) for that option and copy the other, unaffected items unchanged. One option per question must match your best-guess items above. Only include a question if you can also provide these options.`;

export const analyzedItemSchema = z.object({
  name: z.string(),
  portion: z.string(),
  estimated_grams: z.number().min(0),
  calories: z.number().int().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  sat_fat_g: z.number().min(0),
  fiber_g: z.number().min(0),
  sugar_g: z.number().min(0),
  sodium_mg: z.number().min(0),
});

// One tappable answer to a clarifying question. It carries the FULL item list
// for the meal as it would be if this answer were true, so a single tapped
// answer applies the corrected nutrition instantly with no re-analysis.
export const clarificationOptionSchema = z.object({
  label: z.string(),
  items: z.array(analyzedItemSchema).min(1),
});

// One clarifying question with its tappable answers.
export const clarificationQuestionSchema = z.object({
  question: z.string(),
  options: z.array(clarificationOptionSchema).min(1),
});

export const analysisSchema = z.object({
  meal_name: z.string(),
  items: z.array(analyzedItemSchema).min(1),
  // Zero or more clarifying questions, only when genuinely uncertain.
  questions: z.array(clarificationQuestionSchema),
});

export type ClarificationOption = z.infer<typeof clarificationOptionSchema>;
export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;

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
