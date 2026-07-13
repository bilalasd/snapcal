import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { fetchJson, fetchMealsRange } from "../../lib/api";
import { localDateString, mealTotals, type ApiMeal, type Goals } from "@mealio/shared";
import { Card, Skeleton, Kicker, SegmentedToggle } from "../../components/ui";
import { MealListItem } from "../../components/meal-list-item";
import { MealDrawer } from "../../components/meal-drawer";

interface DayGroup {
  date: string;
  label: string;
  meals: ApiMeal[];
  calories: number;
}

function groupByDay(meals: ApiMeal[]): DayGroup[] {
  const groups = new Map<string, ApiMeal[]>();
  for (const meal of meals) {
    const key = localDateString(new Date(meal.eatenAt));
    groups.set(key, [...(groups.get(key) ?? []), meal]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, dayMeals]) => ({
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
      meals: dayMeals,
      calories: dayMeals.reduce((sum, m) => sum + mealTotals(m).calories, 0),
    }));
}

export default function History() {
  const [meals, setMeals] = useState<ApiMeal[] | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [range, setRange] = useState<"7" | "30">("7");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiMeal | null>(null);
  const [today, setToday] = useState<string | null>(null);

  const load = useCallback(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    fetchMealsRange(from, now)
      .then((rows) => {
        setMeals(rows);
        setToday(localDateString(now));
      })
      .catch(() => setMeals([]));
  }, []);

  useEffect(() => {
    load();
    fetchJson<Goals>("/api/goals").then(setGoals).catch(() => {});
  }, [load]);
  useFocusEffect(useCallback(() => load(), [load]));

  const days = useMemo(() => groupByDay(meals ?? []), [meals]);

  const chartData = useMemo(() => {
    if (!today) return [];
    const anchor = new Date(`${today}T12:00:00`);
    const numDays = Number(range);
    const result: { day: string; calories: number }[] = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(anchor.getTime() - i * 24 * 60 * 60 * 1000);
      const date = localDateString(d);
      const group = days.find((g) => g.date === date);
      result.push({ day: d.toLocaleDateString([], { month: "numeric", day: "numeric" }), calories: group?.calories ?? 0 });
    }
    return result;
  }, [days, range, today]);

  const chartMax = Math.max(goals?.daily_calories ?? 0, ...chartData.map((d) => d.calories), 1);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="p-5 gap-5">
        <View>
          <Kicker>Archive</Kicker>
          <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">History</Text>
        </View>

        {meals === null ? (
          <View className="gap-3">
            <Skeleton className="h-48 w-full rounded-3xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </View>
        ) : days.length === 0 ? (
          <Card className="items-center gap-2 p-8">
            <Text className="text-lg font-black text-foreground">No meals yet</Text>
            <Text className="text-center text-muted-foreground">Your logged days — and a calorie chart — show up here once you log a meal.</Text>
          </Card>
        ) : (
          <>
            <Card className="border-transparent bg-block-lilac p-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Kicker>Plate index</Kicker>
                  <Text className="mt-1 text-2xl font-black tracking-tight text-foreground">Calories</Text>
                </View>
                <SegmentedToggle options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }]} value={range} onChange={setRange} />
              </View>
              {/* Simple bar chart — react-native-svg version lands in Phase 4. */}
              <View className="mt-4 h-44 flex-row items-end gap-0.5">
                {chartData.map((d, i) => {
                  const over = goals !== null && d.calories > goals.daily_calories;
                  return (
                    <View key={i} className="flex-1 items-center justify-end">
                      <View
                        className={`w-full rounded-t ${over ? "bg-destructive" : "bg-foreground"}`}
                        style={{ height: `${Math.max((d.calories / chartMax) * 100, 1)}%` }}
                      />
                    </View>
                  );
                })}
              </View>
              {goals ? (
                <Text className="mt-2 text-right text-[10px] text-muted-foreground">Goal {goals.daily_calories.toLocaleString()} cal</Text>
              ) : null}
            </Card>

            <View className="gap-3">
              {days.map((day) => {
                const isOpen = expanded === day.date;
                const overGoal = goals !== null && day.calories > goals.daily_calories;
                return (
                  <Card key={day.date} className="p-4">
                    <Pressable className="min-h-11 flex-row items-center gap-2" onPress={() => setExpanded(isOpen ? null : day.date)}>
                      <Text className="flex-1 text-lg font-black tracking-tight text-foreground">{day.label}</Text>
                      <View className="flex-row items-center gap-1">
                        {overGoal ? <Feather name="trending-up" size={13} color="#d92d20" /> : null}
                        <Text className={`text-sm font-semibold tabular-nums ${overGoal ? "text-destructive" : "text-foreground"}`}>{day.calories} cal</Text>
                      </View>
                      <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#565656" />
                    </Pressable>
                    {isOpen ? (
                      <View className="mt-2 gap-2">
                        {day.meals.map((meal) => (
                          <MealListItem key={meal.id} meal={meal} onPress={() => setSelected(meal)} />
                        ))}
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <MealDrawer meal={selected} onClose={() => setSelected(null)} onChanged={load} />
    </SafeAreaView>
  );
}
