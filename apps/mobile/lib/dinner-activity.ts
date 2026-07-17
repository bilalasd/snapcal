import { requireOptionalNativeModule } from "expo-modules-core";
import { mealTotals, type ApiMeal, type Goals } from "@loggi/shared";

const native = requireOptionalNativeModule<{
  startDinnerActivity(label: string, reserved: number, remaining: number): void;
  endDinnerActivity(): void;
}>("WidgetBridge");

/** Mirror today's reserved (planned) meals to the dinner-out Live Activity:
 *  a reservation starts/updates it, confirming or deleting the last planned
 *  meal ends it. Called from the same cache hook that syncs widgets, so it
 *  can never drift from what Today shows. No-op off-iOS / in Expo Go. */
export function syncDinnerActivity(todayMeals: ApiMeal[] | undefined, goals: Goals | null) {
  if (!native || !goals) return;
  try {
    const meals = todayMeals ?? [];
    const planned = meals.filter((m) => m.planned);
    if (planned.length === 0) {
      native.endDinnerActivity();
      return;
    }
    const eaten = meals
      .filter((m) => !m.planned)
      .reduce((sum, m) => sum + mealTotals(m).calories, 0);
    const reserved = planned.reduce((sum, m) => sum + mealTotals(m).calories, 0);
    const remaining = Math.round(goals.daily_calories - eaten - reserved);
    native.startDinnerActivity(
      planned[0].name || "Reserved",
      Math.round(reserved),
      remaining,
    );
  } catch {
    // ponytail: the activity is best-effort decoration — never break logging
  }
}
