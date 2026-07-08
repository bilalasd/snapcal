import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, foods } from "@/db";
import { toFoodRow, type UsdaFood } from "@/lib/usda";

export const maxDuration = 60;

// Runs behind session auth (the proxy guards /api/*). Seeds a starter set of
// common whole foods from USDA using DEMO_KEY, or the full-ish catalog if
// FDC_API_KEY is set. Idempotent — conflicts on fdc_id are skipped.
const STARTER_QUERIES = [
  "chicken breast", "chicken thigh", "ground beef", "beef steak", "pork chop",
  "salmon", "tuna", "shrimp", "egg", "milk", "greek yogurt", "cheddar cheese",
  "white rice cooked", "brown rice cooked", "whole wheat bread", "oats",
  "pasta cooked", "potato", "sweet potato", "banana", "apple", "broccoli",
  "spinach", "almonds", "peanut butter", "lentils cooked", "black beans",
  "chickpeas", "tofu", "olive oil",
];

async function searchOne(
  apiKey: string,
  query: string,
): Promise<UsdaFood[]> {
  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        dataType: ["SR Legacy"],
        pageSize: 5,
      }),
    },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { foods?: UsdaFood[] };
  return data.foods ?? [];
}

export async function POST() {
  const apiKey = process.env.FDC_API_KEY ?? "DEMO_KEY";
  let imported = 0;

  for (const q of STARTER_QUERIES) {
    const rows = (await searchOne(apiKey, q))
      .map(toFoodRow)
      .filter((r) => r !== null);
    for (const r of rows) {
      await db
        .insert(foods)
        .values({
          fdcId: r.fdcId,
          description: r.description,
          category: r.category,
          calories: String(r.calories),
          proteinG: String(r.proteinG),
          carbsG: String(r.carbsG),
          fatG: String(r.fatG),
          satFatG: r.satFatG === null ? null : String(r.satFatG),
          fiberG: r.fiberG === null ? null : String(r.fiberG),
          sugarG: r.sugarG === null ? null : String(r.sugarG),
          sodiumMg: r.sodiumMg === null ? null : String(r.sodiumMg),
        })
        .onConflictDoNothing({ target: foods.fdcId });
      imported++;
    }
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(foods);

  return NextResponse.json({ imported, total: count });
}
