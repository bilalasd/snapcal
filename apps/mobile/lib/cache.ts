import { localDateString, type ApiMeal, type DraftItem, type DraftPhoto, type Goals } from "@loggi/shared";
import { fetchJson, fetchMealsRange, tzOffsetMinutes } from "./api";
import { readJson, removeFile, writeJson } from "./disk";
import { syncWidget } from "./widget";
import { syncDinnerActivity } from "./dinner-activity";
import { syncEveningReminder } from "./reminder";

// In-memory stale-while-revalidate cache: screens show the last data instantly
// on focus, then refresh in the background — no skeleton flash on tab switches.
const mealsByDate: Record<string, ApiMeal[]> = {};
let goals: Goals | null = null;

export const getCachedMeals = (date: string): ApiMeal[] | undefined => mealsByDate[date];
export const getCachedGoals = (): Goals | null => goals;
export const setCachedGoals = (g: Goals) => {
  goals = g;
  syncWidgetFromCache();
};

// Mirror today's cached state to the iOS widgets and the evening reminder.
const syncWidgetFromCache = () => {
  const today = mealsByDate[localDateString()];
  syncWidget(today, goals);
  syncDinnerActivity(today, goals);
  void syncEveningReminder((today ?? []).some((m) => !m.planned));
  persistCache();
};

// Disk mirror of goals + mealsByDate, so a cold launch paints the last
// session's data instantly instead of a skeleton — the same stale-while-
// revalidate as tab switches, extended across process death. Best-effort,
// like everything in disk.ts. syncWidgetFromCache is the choke point every
// mutation of these two already flows through, so persisting there covers all
// writers.
const CACHE_FILE = "cache-snapshot.json";
const KEEP_DAYS = 35; // covers History's 30-day range; keeps the file bounded

interface Snapshot {
  goals: Goals | null;
  mealsByDate: Record<string, ApiMeal[]>;
}

function persistCache() {
  const cutoff = localDateString(new Date(Date.now() - KEEP_DAYS * 86_400_000));
  const days = Object.fromEntries(Object.entries(mealsByDate).filter(([d]) => d >= cutoff));
  void writeJson(CACHE_FILE, { goals, mealsByDate: days } satisfies Snapshot);
}

/** App start (module scope in _layout, before any screen mounts): restore the
 *  last session's cache. In-memory data always wins over the disk copy. */
export async function hydrateCache(): Promise<void> {
  const saved = await readJson<Snapshot>(CACHE_FILE);
  if (!saved) return;
  goals ??= saved.goals;
  for (const [date, m] of Object.entries(saved.mealsByDate)) mealsByDate[date] ??= m;
}

/** Sign-out: the next account on this device must not inherit this one's data.
 *  Also covers the in-session account switch, which the old in-memory cache
 *  silently leaked across. */
export function clearCache() {
  for (const key of Object.keys(mealsByDate)) delete mealsByDate[key];
  goals = null;
  historyRange = null;
  rangeFetchedAt = 0;
  trends = null;
  favorites = null;
  recents = null;
  pendingNew.clear();
  pendingEdit.clear();
  pendingDelete.clear();
  void removeFile(CACHE_FILE);
}

/** For the Settings reminder toggle: is anything (non-planned) logged today? */
export const hasLoggedToday = (): boolean =>
  (mealsByDate[localDateString()] ?? []).some((m) => !m.planned);

// History's rolling 30-day range (one slot — the query is always the same).
let historyRange: ApiMeal[] | null = null;
let rangeFetchedAt = 0;
export const getCachedRange = (): ApiMeal[] | null => historyRange;
// ponytail: 30s freshness window to skip refetch-on-every-tab-focus; optimistic
// edits update the cache directly so skipping is safe.
export const rangeIsFresh = () => Date.now() - rangeFetchedAt < 30_000;

// Weight tab's trends response — warmed by prefetch below so the tab paints
// current data even right after logging. Shape is owned by weight.tsx.
let trends: unknown = null;
export const getCachedTrends = <T>(): T | null => trends as T | null;
export const setCachedTrends = (t: unknown) => {
  trends = t;
};

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
  syncWidgetFromCache();
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
  prefetchAfterMutation();
}

// A settled meal mutation changes History and the weight-trend math — warm
// both caches now so those tabs paint current data instead of refetching on
// focus. Fire-and-forget; failures just mean the tab fetches as before.
function prefetchAfterMutation() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  fetchMealsRange(from, now)
    .then((meals) => reconcileRange(meals))
    .catch(() => {});
  fetchJson(`/api/trends?days=90&tz_offset=${tzOffsetMinutes()}`)
    .then((t) => setCachedTrends(t))
    .catch(() => {});
}

const stripFromCaches = (id: string) => {
  for (const key of Object.keys(mealsByDate)) mealsByDate[key] = mealsByDate[key].filter((m) => m.id !== id);
  if (historyRange) historyRange = historyRange.filter((m) => m.id !== id);
};

/** Optimistic delete: gone from every cached list immediately. */
export function applyMealDelete(id: string) {
  pendingDelete.add(id);
  stripFromCaches(id);
  syncWidgetFromCache();
}

/** Undo of an optimistic delete whose DELETE was never sent: exact inverse of
 *  applyMealDelete — back into the cached lists, no longer marked deleted. */
export function restoreMeal(meal: ApiMeal) {
  pendingDelete.delete(meal.id);
  const date = localDateString(new Date(meal.eatenAt));
  mealsByDate[date] = [meal, ...(mealsByDate[date] ?? [])];
  if (historyRange) historyRange = [meal, ...historyRange];
  syncWidgetFromCache();
}

/** Optimistic edit: replace the meal in every cached list (moving days if the date changed). */
export function applyMealEdit(meal: ApiMeal) {
  pendingEdit.set(meal.id, meal);
  stripFromCaches(meal.id);
  const date = localDateString(new Date(meal.eatenAt));
  mealsByDate[date] = [meal, ...(mealsByDate[date] ?? [])];
  if (historyRange) historyRange = [meal, ...historyRange];
  syncWidgetFromCache();
}

/** A failed optimistic save: drop the stand-in meal entirely. */
export function discardOptimistic(id: string) {
  pendingNew.delete(id);
  stripFromCaches(id);
  syncWidgetFromCache();
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
  draft: { name: string; items: DraftItem[]; source: string; photos: DraftPhoto[]; planned?: boolean },
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
    planned: draft.planned ?? false,
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
  syncWidgetFromCache();
}
