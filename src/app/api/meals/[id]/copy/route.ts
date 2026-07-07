import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, mealItems, meals } from "@/db";

type Params = { params: Promise<{ id: string }> };

/**
 * Returns a draft copy of the meal (dated now, source "copy") for the client
 * to review and save via POST /api/meals. Nothing is written here.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const [meal] = await db.select().from(meals).where(eq(meals.id, id));
  if (!meal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const items = await db
    .select()
    .from(mealItems)
    .where(eq(mealItems.mealId, id));

  return NextResponse.json({
    name: meal.name,
    note: meal.note,
    source: "copy",
    eaten_at: new Date().toISOString(),
    items: items.map((item) => ({
      name: item.name,
      portion: item.portion,
      calories: item.calories,
      protein_g: Number(item.proteinG),
      carbs_g: Number(item.carbsG),
      fat_g: Number(item.fatG),
    })),
  });
}
