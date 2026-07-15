import { localDateString, type ApiMeal, type DraftItem, type DraftPhoto, type Goals } from "@loggi/shared";

// In-memory stale-while-revalidate cache: screens show the last data instantly
// on focus, then refresh in the background — no skeleton flash on tab switches.
const mealsByDate: Record<string, ApiMeal[]> = {};
let goals: Goals | null = null;

export const getCachedMeals = (date: string): ApiMeal[] | undefined => mealsByDate[date];
export const setCachedMeals = (date: string, m: ApiMeal[]) => {
  mealsByDate[date] = m;
};
export const getCachedGoals = (): Goals | null => goals;
export const setCachedGoals = (g: Goals) => {
  goals = g;
};

// History's rolling 30-day range (one slot — the query is always the same).
let historyRange: ApiMeal[] | null = null;
export const getCachedRange = (): ApiMeal[] | null => historyRange;
export const setCachedRange = (m: ApiMeal[]) => {
  historyRange = m;
};

/** Build an ApiMeal-shaped stand-in from a draft so a just-saved meal can show
 *  on Today instantly, before the network round-trip finishes. */
export function optimisticMeal(
  draft: { name: string; items: DraftItem[]; source: string; photos: DraftPhoto[] },
  eatenAt: string,
  localPhotoUris: string[],
): ApiMeal {
  const id = `optimistic-${Date.now()}`;
  return {
    id,
    eatenAt,
    name: draft.name || "Meal",
    note: null,
    isFavorite: false,
    source: draft.source,
    createdAt: eatenAt,
    items: draft.items.map((it: DraftItem, i) => ({
      id: `${id}-${i}`,
      mealId: id,
      name: it.name,
      portion: it.portion,
      calories: it.calories,
      proteinG: String(it.protein_g),
      carbsG: String(it.carbs_g),
      fatG: String(it.fat_g),
      satFatG: it.sat_fat_g == null ? null : String(it.sat_fat_g),
      fiberG: it.fiber_g == null ? null : String(it.fiber_g),
      sugarG: it.sugar_g == null ? null : String(it.sugar_g),
      sodiumMg: it.sodium_mg == null ? null : String(it.sodium_mg),
    })),
    photos: [
      ...draft.photos.map((p, i) => ({ id: `${id}-p${i}`, mealId: id, url: p.url, pathname: p.pathname })),
      ...localPhotoUris.map((uri, i) => ({ id: `${id}-l${i}`, mealId: id, url: uri, pathname: "" })),
    ],
  };
}

/** Insert an optimistic meal into the right day's cache, newest-first. */
export function addOptimisticMeal(meal: ApiMeal) {
  const date = localDateString(new Date(meal.eatenAt));
  mealsByDate[date] = [meal, ...(mealsByDate[date] ?? [])];
}
