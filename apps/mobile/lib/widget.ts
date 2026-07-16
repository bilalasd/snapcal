import { requireOptionalNativeModule } from "expo-modules-core";
import { localDateString, widgetPayload, type ApiMeal, type Goals } from "@loggi/shared";

const native = requireOptionalNativeModule<{ setWidgetData(json: string): void }>("WidgetBridge");

/** Push today's totals to the iOS widgets. No-op on Android / Expo Go / before goals load. */
export function syncWidget(todayMeals: ApiMeal[] | undefined, goals: Goals | null) {
  if (!native || !goals) return;
  try {
    native.setWidgetData(JSON.stringify(widgetPayload(todayMeals ?? [], goals, localDateString())));
  } catch {
    // ponytail: widget is best-effort decoration — never let it break logging
  }
}
