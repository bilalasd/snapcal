import { and, desc, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { db, mealItems, mealPhotos, meals } from "@/db";
import { z } from "zod";

export const mealItemInput = z.object({
  name: z.string().min(1),
  portion: z.string(),
  calories: z.number().int().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  sat_fat_g: z.number().min(0).nullable().optional(),
  fiber_g: z.number().min(0).nullable().optional(),
  sugar_g: z.number().min(0).nullable().optional(),
  sodium_mg: z.number().min(0).nullable().optional(),
});

export const mealPhotoInput = z.object({
  url: z.string().url(),
  pathname: z.string().min(1),
});

export const mealInput = z.object({
  name: z.string().min(1),
  eaten_at: z.string().datetime({ offset: true }),
  note: z.string().optional(),
  source: z.enum(["photo", "text", "favorite", "copy"]).default("photo"),
  items: z.array(mealItemInput).min(1),
  photos: z.array(mealPhotoInput).optional(),
});

export type MealInput = z.infer<typeof mealInput>;

const numOrNull = (v: number | null | undefined) =>
  v === null || v === undefined ? null : String(v);

function itemValues(mealId: string, item: z.infer<typeof mealItemInput>) {
  return {
    mealId,
    name: item.name,
    portion: item.portion,
    calories: item.calories,
    proteinG: String(item.protein_g),
    carbsG: String(item.carbs_g),
    fatG: String(item.fat_g),
    satFatG: numOrNull(item.sat_fat_g),
    fiberG: numOrNull(item.fiber_g),
    sugarG: numOrNull(item.sugar_g),
    sodiumMg: numOrNull(item.sodium_mg),
  };
}

export async function createMeal(userId: string, input: MealInput) {
  const [meal] = await db
    .insert(meals)
    .values({
      userId,
      name: input.name,
      eatenAt: new Date(input.eaten_at),
      note: input.note ?? null,
      source: input.source,
    })
    .returning();

  const items = await db
    .insert(mealItems)
    .values(input.items.map((item) => itemValues(meal.id, item)))
    .returning();

  let photos: (typeof mealPhotos.$inferSelect)[] = [];
  if (input.photos && input.photos.length > 0) {
    photos = await db
      .insert(mealPhotos)
      .values(
        input.photos.map((p) => ({
          mealId: meal.id,
          url: p.url,
          pathname: p.pathname,
        })),
      )
      .returning();
  }

  return { ...meal, items, photos };
}

async function attachChildren<T extends { id: string }>(rows: T[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((m) => m.id);
  const [items, photos] = await Promise.all([
    db.select().from(mealItems).where(inArray(mealItems.mealId, ids)),
    db.select().from(mealPhotos).where(inArray(mealPhotos.mealId, ids)),
  ]);
  return rows.map((meal) => ({
    ...meal,
    items: items.filter((i) => i.mealId === meal.id),
    photos: photos.filter((p) => p.mealId === meal.id),
  }));
}

export async function listMeals(userId: string, from: Date, to: Date) {
  const rows = await db
    .select()
    .from(meals)
    .where(
      and(
        eq(meals.userId, userId),
        gte(meals.eatenAt, from),
        lte(meals.eatenAt, to),
      ),
    )
    .orderBy(desc(meals.eatenAt));
  return attachChildren(rows);
}

export async function listFavorites(userId: string) {
  const rows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.isFavorite, true)))
    .orderBy(desc(meals.createdAt));
  return attachChildren(rows);
}

export async function listRecentMeals(
  userId: string,
  limit: number,
  search?: string,
) {
  const where = search
    ? and(eq(meals.userId, userId), ilike(meals.name, `%${search}%`))
    : eq(meals.userId, userId);
  const rows = await db
    .select()
    .from(meals)
    .where(where)
    .orderBy(desc(meals.eatenAt))
    .limit(limit);
  return attachChildren(rows);
}
