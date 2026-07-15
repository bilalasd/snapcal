import { localDateString, type ApiMeal, type DraftItem, type DraftPhoto, type Goals } from "@loggi/shared";

// In-memory stale-while-revalidate cache: screens show the last data instantly
// on focus, then refresh in the background — no skeleton flash on tab switches.
const mealsByDate: Record<string, ApiMeal[]> = {};
let goals: Goals | null = null;

export const getCachedMeals = (date: string): ApiMeal[] | undefined => mealsByDate[date];
export const getCachedGoals = (): Goals | null => goals;
export const setCachedGoals = (g: Goals) => {
  goals = g;
};

// History's rolling 30-day range (one slot — the query is always the same).
let historyRange: ApiMeal[] | null = null;
let rangeFetchedAt = 0;
export const getCachedRange = (): ApiMeal[] | null => historyRange;
// ponytail: 30s freshness window to skip refetch-on-every-tab-focus; optimistic
// edits update the cache directly so skipping is safe.
export const rangeIsFresh = () => Date.now() - rangeFetchedAt < 30_000;

// Add-screen lists, cached so the speed-dial sheets paint instantly.
let favorites: ApiMeal[] | null = null;
let recents: ApiMeal[] | null = null;
export const getCachedFavorites = (): ApiMeal[] | null => favorites;
export const setCachedFavorites = (m: ApiMeal[]) => {
  favorites = m;
};
export const getCachedRecents = (): ApiMeal[] | null => recents;
export const setCachedRecents = (m: ApiMeal[]) => {
  recents = m;
};

// Mutations in flight. Server responses are overlaid with these on every
// reconcile, so a refetch racing a background POST/PATCH/DELETE can't undo the
// optimistic UI. settleMeal() drops the overlay once the request lands.
// ponytail: edits overlay by id in place — an in-flight date move can show the
// meal on its old day for one round-trip; the next refetch settles it.
const pendingNew = new Map<string, ApiMeal>();
const pendingEdit = new Map<string, ApiMeal>();
const pendingDelete = new Set<string>();

const overlay = (server: ApiMeal[]): ApiMeal[] =>
  server.filter((m) => !pendingDelete.has(m.id)).map((m) => pendingEdit.get(m.id) ?? m);

/** Merge a server response for one day with in-flight mutations, cache it, return it. */
export function reconcileMeals(date: string, server: ApiMeal[]): ApiMeal[] {
  const merged = [
    ...[...pendingNew.values()].filter((m) => localDateString(new Date(m.eatenAt)) === date),
    ...overlay(server),
  ];
  mealsByDate[date] = merged;
  return merged;
}

/** Same, for History's 30-day range. */
export function reconcileRange(server: ApiMeal[]): ApiMeal[] {
  const merged = [...pendingNew.values(), ...overlay(server)];
  historyRange = merged;
  rangeFetchedAt = Date.now();
  return merged;
}

/** The background request landed (or failed) — stop protecting this meal. */
export function settleMeal(id: string) {
  pendingNew.delete(id);
  pendingEdit.delete(id);
  pendingDelete.delete(id);
}

const stripFromCaches = (id: string) => {
  for (const key of Object.keys(mealsByDate)) mealsByDate[key] = mealsByDate[key].filter((m) => m.id !== id);
  if (historyRange) historyRange = historyRange.filter((m) => m.id !== id);
};

/** Optimistic delete: gone from every cached list immediately. */
export function applyMealDelete(id: string) {
  pendingDelete.add(id);
  stripFromCaches(id);
}

/** Optimistic edit: replace the meal in every cached list (moving days if the date changed). */
export function applyMealEdit(meal: ApiMeal) {
  pendingEdit.set(meal.id, meal);
  stripFromCaches(meal.id);
  const date = localDateString(new Date(meal.eatenAt));
  mealsByDate[date] = [meal, ...(mealsByDate[date] ?? [])];
  if (historyRange) historyRange = [meal, ...historyRange];
}

/** A failed optimistic save: drop the stand-in meal entirely. */
export function discardOptimistic(id: string) {
  pendingNew.delete(id);
  stripFromCaches(id);
}

export function draftItemsToApi(items: DraftItem[], mealId: string): ApiMeal["items"] {
  return items.map((it, i) => ({
    id: `${mealId}-${i}`,
    mealId,
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
  }));
}

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
    items: draftItemsToApi(draft.items, id),
    photos: [
      ...draft.photos.map((p, i) => ({ id: `${id}-p${i}`, mealId: id, url: p.url, pathname: p.pathname })),
      ...localPhotoUris.map((uri, i) => ({ id: `${id}-l${i}`, mealId: id, url: uri, pathname: "" })),
    ],
  };
}

/** Insert an optimistic meal into the cached lists, newest-first, and protect
 *  it from racing refetches until settleMeal()/discardOptimistic(). */
export function addOptimisticMeal(meal: ApiMeal) {
  pendingNew.set(meal.id, meal);
  const date = localDateString(new Date(meal.eatenAt));
  mealsByDate[date] = [meal, ...(mealsByDate[date] ?? [])];
  if (historyRange) historyRange = [meal, ...historyRange];
}
