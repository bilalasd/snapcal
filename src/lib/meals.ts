import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, mealItems, meals } from "@/db";
import { z } from "zod";

export const mealItemInput = z.object({
  name: z.string().min(1),
  portion: z.string(),
  calories: z.number().int().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
});

export const mealInput = z.object({
  name: z.string().min(1),
  eaten_at: z.string().datetime({ offset: true }),
  note: z.string().optional(),
  source: z.enum(["photo", "text", "favorite", "copy"]).default("photo"),
  items: z.array(mealItemInput).min(1),
});

export type MealInput = z.infer<typeof mealInput>;

export async function createMeal(input: MealInput) {
  const [meal] = await db
    .insert(meals)
    .values({
      name: input.name,
      eatenAt: new Date(input.eaten_at),
      note: input.note ?? null,
      source: input.source,
    })
    .returning();

  const items = await db
    .insert(mealItems)
    .values(
      input.items.map((item) => ({
        mealId: meal.id,
        name: item.name,
        portion: item.portion,
        calories: item.calories,
        proteinG: String(item.protein_g),
        carbsG: String(item.carbs_g),
        fatG: String(item.fat_g),
      })),
    )
    .returning();

  return { ...meal, items };
}

export async function listMeals(from: Date, to: Date) {
  const rows = await db
    .select()
    .from(meals)
    .where(and(gte(meals.eatenAt, from), lte(meals.eatenAt, to)))
    .orderBy(desc(meals.eatenAt));

  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(mealItems)
    .where(
      inArray(
        mealItems.mealId,
        rows.map((m) => m.id),
      ),
    );
  const byMeal = new Map<string, typeof items>();
  for (const item of items) {
    const list = byMeal.get(item.mealId) ?? [];
    list.push(item);
    byMeal.set(item.mealId, list);
  }
  return rows.map((meal) => ({ ...meal, items: byMeal.get(meal.id) ?? [] }));
}

export async function listFavorites() {
  const rows = await db
    .select()
    .from(meals)
    .where(eq(meals.isFavorite, true))
    .orderBy(desc(meals.createdAt));
  if (rows.length === 0) return [];
  const items = await db
    .select()
    .from(mealItems)
    .where(
      inArray(
        mealItems.mealId,
        rows.map((m) => m.id),
      ),
    );
  return rows.map((meal) => ({
    ...meal,
    items: items.filter((item) => item.mealId === meal.id),
  }));
}
