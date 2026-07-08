/**
 * Import USDA FoodData Central whole ingredients into the `foods` table.
 *
 * Usage:
 *   DATABASE_URL=... FDC_API_KEY=... npx tsx scripts/import-foods.ts
 *
 * With no FDC_API_KEY it uses DEMO_KEY (rate-limited) to seed a starter set of
 * common staples. With a free key from https://fdc.nal.usda.gov/api-key-signup
 * it pulls the full SR Legacy + Foundation catalogs.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { toFoodRow, type UsdaFood } from "../src/lib/usda";

const API_KEY = process.env.FDC_API_KEY ?? "DEMO_KEY";
const FULL = Boolean(process.env.FDC_API_KEY);
const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

// Starter queries for DEMO_KEY mode — common whole foods
const STARTER_QUERIES = [
  "chicken breast", "chicken thigh", "beef ground", "beef steak", "pork",
  "salmon", "tuna", "shrimp", "egg", "milk", "yogurt greek", "cheese cheddar",
  "rice white cooked", "rice brown cooked", "bread whole wheat", "oats",
  "pasta cooked", "potato", "sweet potato", "banana", "apple", "orange",
  "broccoli", "spinach", "carrot", "tomato", "avocado", "almonds", "peanut butter",
  "lentils cooked", "beans black cooked", "chickpeas", "tofu", "olive oil", "butter",
];

async function fetchSearch(query: string, dataType: string, pageSize = 50) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, dataType: [dataType], pageSize }),
  });
  if (!res.ok) {
    throw new Error(`USDA search failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { foods?: UsdaFood[] };
  return data.foods ?? [];
}

async function upsert(foods: UsdaFood[]) {
  const rows = foods.map(toFoodRow).filter((r) => r !== null);
  let n = 0;
  for (const r of rows) {
    await db
      .insert(schema.foods)
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
      .onConflictDoNothing({ target: schema.foods.fdcId });
    n++;
  }
  return n;
}

async function main() {
  if (FULL) {
    // Full catalog: page through SR Legacy + Foundation
    let total = 0;
    for (const dataType of ["SR Legacy", "Foundation"]) {
      for (let page = 1; page <= 200; page++) {
        const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${API_KEY}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: "*",
            dataType: [dataType],
            pageSize: 200,
            pageNumber: page,
          }),
        });
        if (!res.ok) break;
        const data = (await res.json()) as {
          foods?: UsdaFood[];
          totalPages?: number;
        };
        if (!data.foods || data.foods.length === 0) break;
        total += await upsert(data.foods);
        console.log(`${dataType} page ${page}: ${total} imported`);
        if (data.totalPages && page >= data.totalPages) break;
      }
    }
    console.log(`Done. ${total} foods imported.`);
  } else {
    console.log("No FDC_API_KEY — seeding starter set with DEMO_KEY…");
    let total = 0;
    for (const q of STARTER_QUERIES) {
      try {
        const foods = await fetchSearch(q, "SR Legacy", 8);
        total += await upsert(foods);
        console.log(`${q}: ${total} imported`);
        await new Promise((r) => setTimeout(r, 1500)); // be gentle on DEMO_KEY
      } catch (err) {
        console.error(`Skipped "${q}":`, (err as Error).message);
      }
    }
    console.log(`Starter set done. ${total} foods.`);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.foods);
  console.log(`foods table now has ${count} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
