import { ilike } from "drizzle-orm";
import { db, foods } from "@/db";
import { foodToItem } from "@/lib/usda";
import type { Analysis } from "@/lib/analysis";

// Words that don't help identify a food when matching against USDA descriptions.
const STOPWORDS = new Set([
  "and", "with", "the", "of", "in", "on", "a", "an", "plain", "fresh",
  "homemade", "small", "medium", "large", "serving", "piece", "slice",
]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

type AnalyzedItem = Analysis["items"][number];
export type GroundedItem = AnalyzedItem & { usda_match?: string };

/**
 * For each analyzed item, look for a confident USDA match by name and, when
 * found, replace its nutrition with lab-measured values scaled to the AI's
 * estimated gram weight. Unmatched items keep the AI estimate.
 */
export async function groundWithUsda(
  items: AnalyzedItem[],
): Promise<GroundedItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!item.estimated_grams || item.estimated_grams <= 0) return item;
      const queryTokens = tokens(item.name);
      if (queryTokens.length === 0) return item;

      // Anchor the DB scan on the longest (usually most specific) token
      const anchor = [...queryTokens].sort((a, b) => b.length - a.length)[0];
      const candidates = await db
        .select()
        .from(foods)
        .where(ilike(foods.description, `%${anchor}%`))
        .limit(40);
      if (candidates.length === 0) return item;

      let best: (typeof candidates)[number] | null = null;
      let bestScore = 0;
      for (const c of candidates) {
        const desc = c.description.toLowerCase();
        const score = queryTokens.filter((t) => desc.includes(t)).length;
        if (
          score > bestScore ||
          (score === bestScore &&
            best &&
            c.description.length < best.description.length)
        ) {
          best = c;
          bestScore = score;
        }
      }

      // Require a real overlap: 2+ shared tokens, or the only token for
      // single-word foods (e.g. "egg", "banana").
      const threshold = queryTokens.length === 1 ? 1 : 2;
      if (!best || bestScore < threshold) return item;

      const grounded = foodToItem(
        {
          description: item.name, // keep the user-facing name from the photo
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
        // Keep the natural portion label rather than "N g"
        portion: item.portion,
        // Nulls from USDA gaps → keep the AI's estimate for those fields
        sat_fat_g: grounded.sat_fat_g ?? item.sat_fat_g,
        fiber_g: grounded.fiber_g ?? item.fiber_g,
        sugar_g: grounded.sugar_g ?? item.sugar_g,
        sodium_mg: grounded.sodium_mg ?? item.sodium_mg,
        usda_match: best.description,
      };
    }),
  );
}
