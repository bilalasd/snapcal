import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { z } from "zod";
import { db, mealItems, mealPhotos, meals } from "@/db";
import { mealItemInput } from "@/lib/meals";

const patchInput = z.object({
  name: z.string().min(1).optional(),
  eaten_at: z.string().datetime({ offset: true }).optional(),
  note: z.string().nullable().optional(),
  is_favorite: z.boolean().optional(),
  planned: z.boolean().optional(),
  items: z.array(mealItemInput).min(1).optional(),
});

type Params = { params: Promise<{ id: string }> };

const numOrNull = (v: number | null | undefined) =>
  v === null || v === undefined ? null : String(v);

export async function PATCH(request: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }
  const input = parsed.data;

  const [existing] = await db
    .select()
    .from(meals)
    .where(and(eq(meals.id, id), eq(meals.userId, userId)));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .update(meals)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.eaten_at !== undefined && { eatenAt: new Date(input.eaten_at) }),
      ...(input.note !== undefined && { note: input.note }),
      ...(input.is_favorite !== undefined && { isFavorite: input.is_favorite }),
      ...(input.planned !== undefined && { planned: input.planned }),
    })
    .where(eq(meals.id, id));

  if (input.items) {
    await db.delete(mealItems).where(eq(mealItems.mealId, id));
    await db.insert(mealItems).values(
      input.items.map((item) => ({
        mealId: id,
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
      })),
    );
  }

  const [meal] = await db.select().from(meals).where(eq(meals.id, id));
  const [items, photos] = await Promise.all([
    db.select().from(mealItems).where(eq(mealItems.mealId, id)),
    db.select().from(mealPhotos).where(eq(mealPhotos.mealId, id)),
  ]);
  return NextResponse.json({ ...meal, items, photos });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Ownership check before any deletion
  const [existing] = await db
    .select()
    .from(meals)
    .where(and(eq(meals.id, id), eq(meals.userId, userId)));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Clean up blobs before the cascade delete removes the rows
  const photos = await db
    .select()
    .from(mealPhotos)
    .where(eq(mealPhotos.mealId, id));
  if (photos.length > 0) {
    await del(photos.map((p) => p.url)).catch((err) =>
      console.error("Blob cleanup failed", err),
    );
  }

  await db.delete(meals).where(eq(meals.id, id));
  return NextResponse.json({ ok: true });
}
