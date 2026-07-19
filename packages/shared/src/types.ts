// API types + pure helpers shared by the backend and the mobile app.
// (The old web-only fetch/sessionStorage helpers were dropped in the RN
// migration — the mobile app builds its own API client and draft storage.)

export interface ApiMealItem {
  id: string;
  mealId: string;
  name: string;
  portion: string;
  calories: number;
  proteinG: string; // numeric columns serialize as strings
  carbsG: string;
  fatG: string;
  satFatG: string | null;
  fiberG: string | null;
  sugarG: string | null;
  sodiumMg: string | null;
}

export interface ApiMealPhoto {
  id: string;
  mealId: string;
  url: string;
  pathname: string;
}

export interface ApiMeal {
  id: string;
  eatenAt: string;
  name: string;
  note: string | null;
  isFavorite: boolean;
  source: string;
  /** Pre-logged for later today: reserves calories, not yet eaten. */
  planned: boolean;
  createdAt: string;
  items: ApiMealItem[];
  photos: ApiMealPhoto[];
}

export interface Goals {
  daily_calories: number;
  daily_protein_g: number;
  daily_carbs_g: number;
  daily_fat_g: number;
  target_rate_kg_per_wk: number;
  unit_system: "metric" | "imperial";
  sex: "male" | "female" | null;
  age: number | null;
  height_cm: number | null;
  activity_level:
    | "sedentary"
    | "light"
    | "moderate"
    | "active"
    | "very_active"
    | null;
  onboarded: boolean;
  goal_weight_kg: number | null;
  adaptive_goal: boolean;
}

/** Editable item shape used by the review card and POST /api/meals. */
export interface DraftItem {
  name: string;
  portion: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sat_fat_g?: number | null;
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
  // Set when the item was reconciled against the USDA database (the matched
  // food's description); display-only, not persisted.
  usda_match?: string | null;
  // AI's own certainty about identity + portion; review-time only, not
  // persisted — once the user confirms the numbers it's stale.
  confidence?: "low" | "medium" | "high" | null;
}

export interface DraftPhoto {
  url: string;
  pathname: string;
}

export interface MealDraft {
  name: string;
  eaten_at: string;
  note?: string;
  source: "photo" | "text" | "favorite" | "copy";
  items: DraftItem[];
  photos?: DraftPhoto[];
  // Optional: pending clarifying questions, shown on the dedicated question
  // step before review. Each option carries the full item list to apply.
  questions?: ClarifyQuestion[];
}

export interface ClarifyOption {
  label: string;
  items: DraftItem[];
}

export interface ClarifyQuestion {
  question: string;
  options: ClarifyOption[];
}

/** Convert an ApiMeal's items into editable DraftItems. */
export function itemsToDraft(meal: ApiMeal): DraftItem[] {
  return meal.items.map((item) => ({
    name: item.name,
    portion: item.portion,
    calories: item.calories,
    protein_g: Number(item.proteinG),
    carbs_g: Number(item.carbsG),
    fat_g: Number(item.fatG),
    sat_fat_g: item.satFatG === null ? null : Number(item.satFatG),
    fiber_g: item.fiberG === null ? null : Number(item.fiberG),
    sugar_g: item.sugarG === null ? null : Number(item.sugarG),
    sodium_mg: item.sodiumMg === null ? null : Number(item.sodiumMg),
  }));
}

export function mealTotals(meal: ApiMeal) {
  return meal.items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + Number(item.proteinG),
      carbs: acc.carbs + Number(item.carbsG),
      fat: acc.fat + Number(item.fatG),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Local calendar date as YYYY-MM-DD. */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Minutes to add to UTC midnight to get local midnight (getTimezoneOffset semantics). */
export function tzOffsetMinutes(): number {
  return new Date().getTimezoneOffset();
}
