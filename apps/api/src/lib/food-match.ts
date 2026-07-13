import { sql } from "drizzle-orm";
import { generateObject, gateway } from "ai";
import { z } from "zod";
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

// Approach A: instead of blindly taking the top full-text hit, retrieve a few
// candidates per item and let a small, fast model pick the right one (or none)
// in ONE batched call. Better matching than keyword rank; still grounds the
// numbers in USDA per-gram values scaled to the AI's estimated grams.
const MATCH_MODEL = process.env.GROUND_MODEL || "google/gemini-2.5-flash-lite";
const CANDIDATES = 6;

const matchSchema = z.object({
  matches: z.array(
    z.object({
      item: z.number().int(), // index into items
      choice: z.number().int().nullable(), // index into that item's candidates, or null
    }),
  ),
});

export async function groundWithLlm(items: AnalyzedItem[]): Promise<GroundedItem[]> {
  // 1. Retrieve top-K USDA candidates per item.
  const candLists = await Promise.all(
    items.map(async (item) => {
      if (!item.estimated_grams || item.estimated_grams <= 0) return [];
      const tsv = sql`to_tsvector('english', ${foods.description})`;
      const tsq = sql`plainto_tsquery('english', ${item.name})`;
      return db
        .select()
        .from(foods)
        .where(sql`${tsq} @@ ${tsv}`)
        .orderBy(sql`ts_rank(${tsv}, ${tsq}) desc`)
        .limit(CANDIDATES);
    }),
  );
  if (!candLists.some((c) => c.length)) return items; // nothing to match

  // 2. One batched call: a fast model picks the best candidate per item.
  const lines = items
    .map((item, i) => {
      const per100 = item.estimated_grams
        ? Math.round((item.calories / item.estimated_grams) * 100)
        : 0;
      const cands =
        candLists[i]
          .map((c, j) => `    [${j}] ${c.description} — ${Number(c.calories)} kcal/100g`)
          .join("\n") || "    (no candidates)";
      return `Item ${i}: "${item.name}" (~${item.estimated_grams} g, ~${per100} kcal/100g)\n${cands}`;
    })
    .join("\n\n");

  const { object } = await generateObject({
    model: gateway(MATCH_MODEL),
    schema: matchSchema,
    system:
      "You match each food item to the closest USDA reference food. Pick the candidate whose description AND calorie density best fit the item. If none is a genuine match (wrong food, or density off by more than ~40%), return null for that item. Return exactly one entry per item index.",
    prompt: `For each item choose the best candidate index, or null.\n\n${lines}`,
  });

  const choiceFor = new Map(object.matches.map((m) => [m.item, m.choice]));

  // 3. Apply the chosen USDA nutrition, scaled to the AI's estimated grams.
  return items.map((item, i) => {
    const choice = choiceFor.get(i);
    const cands = candLists[i];
    if (choice == null || !cands[choice]) return item;
    const best = cands[choice];
    const grounded = foodToItem(
      {
        description: item.name,
        calories: Number(best.calories),
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
      portion: item.portion,
      sat_fat_g: grounded.sat_fat_g ?? item.sat_fat_g,
      fiber_g: grounded.fiber_g ?? item.fiber_g,
      sugar_g: grounded.sugar_g ?? item.sugar_g,
      sodium_mg: grounded.sodium_mg ?? item.sodium_mg,
      usda_match: best.description,
    };
  });
}
