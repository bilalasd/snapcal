import { sql } from "drizzle-orm";
import { db, foods } from "@/db";
import { foodToItem } from "@/lib/usda";
import type { Analysis } from "@mealio/shared";

type AnalyzedItem = Analysis["items"][number];
export type GroundedItem = AnalyzedItem & { usda_match?: string };

/**
 * For each analyzed item, look for a confident USDA match by name and, when
 * found, replace its nutrition with lab-measured values scaled to the AI's
 * estimated gram weight. Unmatched items keep the AI estimate.
 *
 * Matching uses Postgres full-text search: plainto_tsquery requires every word
 * of the food name to appear in the USDA description (AND semantics), so
 * near-misses like "cooked white rice" → "Rice noodles" are excluded rather
 * than mis-matched. A calorie-density sanity check is a second backstop. This
 * deliberately favors false negatives (fall back to the AI estimate) over false
 * positives (a wrong "verified" value).
 */
export async function groundWithUsda(
  items: AnalyzedItem[],
): Promise<GroundedItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!item.estimated_grams || item.estimated_grams <= 0) return item;

      const tsv = sql`to_tsvector('english', ${foods.description})`;
      const tsq = sql`plainto_tsquery('english', ${item.name})`;
      const [best] = await db
        .select()
        .from(foods)
        .where(sql`${tsq} @@ ${tsv}`)
        .orderBy(sql`ts_rank(${tsv}, ${tsq}) desc`)
        .limit(1);
      if (!best) return item;

      // Sanity: the USDA food's calorie density should be in the ballpark of
      // the AI's implied density, or we've matched the wrong thing.
      const aiPer100 = (item.calories / item.estimated_grams) * 100;
      const usdaPer100 = Number(best.calories);
      if (aiPer100 > 0 && Math.abs(usdaPer100 - aiPer100) / aiPer100 > 0.4) {
        return item;
      }

      const grounded = foodToItem(
        {
          description: item.name, // keep the user-facing name
          calories: usdaPer100,
          proteinG: Number(best.proteinG),
          carbsG: Number(best.carbsG),
          fatG: Number(best.fatG),
          satFatG: best.satFatG === null ? null : Number(best.satFatG),
          fiberG: best.fiberG === null ? null : Number(best.fiberG),
          sugarG: best.sugarG === null ? null : Number(best.sugarG),
          sodiumMg: best.sodiumMg === null ? null : Number(best.sodiumMg),
        },
        item.estimated_grams,
      );

      return {
        ...item,
        ...grounded,
        portion: item.portion, // keep the natural portion label
        sat_fat_g: grounded.sat_fat_g ?? item.sat_fat_g,
        fiber_g: grounded.fiber_g ?? item.fiber_g,
        sugar_g: grounded.sugar_g ?? item.sugar_g,
        sodium_mg: grounded.sodium_mg ?? item.sodium_mg,
        usda_match: best.description,
      };
    }),
  );
}
