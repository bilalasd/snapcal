import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { z } from "zod";
import { db, mealItems, mealPhotos, meals } from "@/db";
import { itemValues, mealItemInput } from "@/lib/meals";

const patchInput = z.object({
  name: z.string().min(1).optional(),
  eaten_at: z.string().datetime({ offset: true }).optional(),
  note: z.string().nullable().optional(),
  is_favorite: z.boolean().optional(),
  planned: z.boolean().optional(),
  items: z.array(mealItemInput).min(1).optional(),
});

type Params = { params: Promise<{ id: string }> };

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

  const fields = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.eaten_at !== undefined && { eatenAt: new Date(input.eaten_at) }),
    ...(input.note !== undefined && { note: input.note }),
    ...(input.is_favorite !== undefined && { isFavorite: input.is_favorite }),
    ...(input.planned !== undefined && { planned: input.planned }),
  };

  // Everything after the ownership check goes in one db.batch: a single Neon
  // round trip, run atomically — the items delete+insert can no longer leave
  // a meal item-less when the request dies between the two.
  const updateQ =
    Object.keys(fields).length > 0
      ? db.update(meals).set(fields).where(eq(meals.id, id)).returning()
      : null;
  const photosQ = db.select().from(mealPhotos).where(eq(mealPhotos.mealId, id));

  let meal = existing;
  let items: (typeof mealItems.$inferSelect)[];
  let photos: (typeof mealPhotos.$inferSelect)[];
  if (input.items) {
    const deleteQ = db.delete(mealItems).where(eq(mealItems.mealId, id));
    const insertQ = db
      .insert(mealItems)
      .values(input.items.map((item) => itemValues(id, item)))
      .returning();
    if (updateQ) {
      const [updated, , inserted, ph] = await db.batch([updateQ, deleteQ, insertQ, photosQ]);
      meal = updated[0];
      items = inserted;
      photos = ph;
    } else {
      const [, inserted, ph] = await db.batch([deleteQ, insertQ, photosQ]);
      items = inserted;
      photos = ph;
    }
  } else {
    const itemsQ = db.select().from(mealItems).where(eq(mealItems.mealId, id));
    if (updateQ) {
      const [updated, its, ph] = await db.batch([updateQ, itemsQ, photosQ]);
      meal = updated[0];
      items = its;
      photos = ph;
    } else {
      const [its, ph] = await db.batch([itemsQ, photosQ]);
      items = its;
      photos = ph;
    }
  }

  return NextResponse.json({ ...meal, items, photos });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Ownership check + photo list in one round trip
  const [[existing], photos] = await db.batch([
    db
      .select()
      .from(meals)
      .where(and(eq(meals.id, id), eq(meals.userId, userId))),
    db.select().from(mealPhotos).where(eq(mealPhotos.mealId, id)),
  ]);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Clean up blobs before the cascade delete removes the rows
  if (photos.length > 0) {
    await del(photos.map((p) => p.url)).catch((err) =>
      console.error("Blob cleanup failed", err),
    );
  }

  await db.delete(meals).where(eq(meals.id, id));
  return NextResponse.json({ ok: true });
}
