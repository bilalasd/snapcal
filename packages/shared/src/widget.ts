import { mealTotals, type ApiMeal, type Goals } from "./types";

export interface WidgetPayload {
  date: string;
  calories: number;
  caloriesGoal: number;
  protein: number;
  proteinGoal: number;
  carbs: number;
  carbsGoal: number;
  fat: number;
  fatGoal: number;
}

/** Today's totals for the iOS widgets. Planned meals are reserved, not eaten — excluded. */
export function widgetPayload(meals: ApiMeal[], goals: Goals, date: string): WidgetPayload {
  const t = meals
    .filter((m) => !m.planned)
    .reduce(
      (acc, m) => {
        const mt = mealTotals(m);
        return {
          calories: acc.calories + mt.calories,
          protein: acc.protein + mt.protein,
          carbs: acc.carbs + mt.carbs,
          fat: acc.fat + mt.fat,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  return {
    date,
    calories: Math.round(t.calories),
    caloriesGoal: goals.daily_calories,
    protein: Math.round(t.protein),
    proteinGoal: goals.daily_protein_g,
    carbs: Math.round(t.carbs),
    carbsGoal: goals.daily_carbs_g,
    fat: Math.round(t.fat),
    fatGoal: goals.daily_fat_g,
  };
}
