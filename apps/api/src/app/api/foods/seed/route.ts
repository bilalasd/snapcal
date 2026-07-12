import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, foods } from "@/db";
import { toFoodRow, type UsdaFood } from "@/lib/usda";

export const maxDuration = 60;

// Seeds the USDA food reference. Two modes (runs behind session auth):
//   POST /api/foods/seed                     → ~150 common staples (DEMO_KEY ok)
//   POST /api/foods/seed?dataType=SR%20Legacy&page=N  → one 200-item page of the
//        full catalog (needs FDC_API_KEY). Returns hasMore so a caller can loop.
const STARTER_QUERIES = [
  "chicken breast", "chicken thigh", "ground beef", "beef steak", "pork chop",
  "salmon", "tuna", "shrimp", "egg", "milk", "greek yogurt", "cheddar cheese",
  "white rice cooked", "brown rice cooked", "whole wheat bread", "oats",
  "pasta cooked", "potato", "sweet potato", "banana", "apple", "broccoli",
  "spinach", "almonds", "peanut butter", "lentils cooked", "black beans",
  "chickpeas", "tofu", "olive oil",
];

const rowValues = (r: NonNullable<ReturnType<typeof toFoodRow>>) => ({
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
});

async function upsertBatch(usdaFoods: UsdaFood[]): Promise<number> {
  const rows = usdaFoods.map(toFoodRow).filter((r) => r !== null).map(rowValues);
  if (rows.length === 0) return 0;
  await db.insert(foods).values(rows).onConflictDoNothing({ target: foods.fdcId });
  return rows.length;
}

async function total(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(foods);
  return count;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.FDC_API_KEY ?? "DEMO_KEY";
  const dataType = request.nextUrl.searchParams.get("dataType");
  const page = Number(request.nextUrl.searchParams.get("page") ?? "0");

  // Full-catalog page mode
  if (dataType && page > 0) {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "*",
          dataType: [dataType],
          pageSize: 200,
          pageNumber: page,
        }),
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `USDA error ${res.status}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as {
      foods?: UsdaFood[];
      totalPages?: number;
    };
    const imported = await upsertBatch(data.foods ?? []);
    return NextResponse.json({
      imported,
      total: await total(),
      hasMore: Boolean(data.totalPages && page < data.totalPages),
    });
  }

  // Starter mode
  let imported = 0;
  for (const q of STARTER_QUERIES) {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, dataType: ["SR Legacy"], pageSize: 5 }),
      },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { foods?: UsdaFood[] };
    imported += await upsertBatch(data.foods ?? []);
  }
  return NextResponse.json({ imported, total: await total() });
}
