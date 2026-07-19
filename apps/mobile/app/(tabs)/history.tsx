import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { fetchJson, fetchMealsRange } from "../../lib/api";
import { getCachedRange, rangeIsFresh, reconcileRange, getCachedGoals, setCachedGoals } from "../../lib/cache";
import { goalForDate } from "../../lib/goal-history";
import { localDateString, mealTotals, type ApiMeal, type Goals } from "@loggi/shared";
import { Card, Skeleton, Kicker, SegmentedToggle } from "../../components/ui";
import Animated, { Easing, FadeIn, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { MealListItem } from "../../components/meal-list-item";
import { MealDrawer } from "../../components/meal-drawer";
import { Bevi } from "../../components/bevi";
import { BarChart } from "../../components/charts";
import { useColors, block } from "../../lib/colors";

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
    const group = groups.get(key);
    if (group) group.push(meal);
    else groups.set(key, [meal]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, dayMeals]) => ({
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
      meals: dayMeals,
      // Planned (reserved, unconfirmed) meals don't count as eaten calories.
      calories: dayMeals.reduce((sum, m) => sum + (m.planned ? 0 : mealTotals(m).calories), 0),
    }));
}

export default function History() {
  const colors = useColors();
  const reduce = useReducedMotion();
  const [meals, setMeals] = useState<ApiMeal[] | null>(() => getCachedRange());
  const [goals, setGoals] = useState<Goals | null>(() => getCachedGoals());
  const [range, setRange] = useState<"7" | "30">("7");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiMeal | null>(null);
  const [today, setToday] = useState<string | null>(() => localDateString());
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((force = false) => {
    const cached = getCachedRange();
    if (cached) setMeals(cached); // instant — optimistic edits/deletes show right away
    if (!force && cached && rangeIsFresh()) return Promise.resolve(); // fetched <30s ago; skip the round-trip
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return fetchMealsRange(from, now)
      .then((rows) => {
        setMeals(reconcileRange(rows));
        setToday(localDateString(now));
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    // load() is covered by useFocusEffect, which also fires on mount.
    // Goals: Settings/onboarding saves keep the cache fresh — only fetch cold.
    if (getCachedGoals()) return;
    fetchJson<Goals>("/api/goals")
      .then((g) => {
        setGoals(g);
        setCachedGoals(g);
      })
      .catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const days = useMemo(() => groupByDay(meals ?? []), [meals]);

  // One-line read on the selected range: average across logged days, plus how
  // many finished days came in at or under target (today is excluded — a
  // half-logged day isn't a win, same rule as Today's counter).
  const insight = useMemo(() => {
    if (!today) return null;
    const cutoff = new Date(`${today}T12:00:00`).getTime() - (Number(range) - 1) * 24 * 60 * 60 * 1000;
    const inRange = days.filter((g) => new Date(`${g.date}T12:00:00`).getTime() >= cutoff);
    if (inRange.length === 0) return null;
    const avg = Math.round(inRange.reduce((sum, g) => sum + g.calories, 0) / inRange.length);
    const goal = goals?.daily_calories ?? 0;
    // Judge each day by the goal that was in effect then (lib/goal-history).
    const onTarget = goal ? inRange.filter((g) => g.date !== today && g.calories <= goalForDate(g.date, goal)).length : 0;
    return { avg, logged: inRange.length, onTarget };
  }, [days, range, today, goals]);

  const chartData = useMemo(() => {
    if (!today) return [];
    const anchor = new Date(`${today}T12:00:00`);
    const numDays = Number(range);
    const caloriesByDate = new Map(days.map((g) => [g.date, g.calories]));
    const result: { day: string; calories: number }[] = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(anchor.getTime() - i * 24 * 60 * 60 * 1000);
      const date = localDateString(d);
      result.push({ day: d.toLocaleDateString([], { month: "numeric", day: "numeric" }), calories: caloriesByDate.get(date) ?? 0 });
    }
    return result;
  }, [days, range, today]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        contentContainerClassName="p-5 pb-28 gap-5"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.mutedForeground} />}
      >
        <View>
          <Kicker>Archive</Kicker>
          <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">History</Text>
        </View>

        {meals === null && failed ? (
          <Card className="items-center gap-2 p-8">
            <Bevi pose="standing" size={120} />
            <Text className="text-lg font-black text-foreground">Couldn't load</Text>
            <Text className="text-center text-muted-foreground">Check your connection and try again.</Text>
            <Pressable className="mt-2 min-h-11 justify-center rounded-full bg-foreground px-6" onPress={() => void load()}>
              <Text className="font-black text-background">Retry</Text>
            </Pressable>
          </Card>
        ) : meals === null ? (
          <View className="gap-3">
            <Skeleton className="h-48 w-full rounded-3xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </View>
        ) : days.length === 0 ? (
          <Card className="items-center gap-2 p-8">
            <Bevi pose="standing" size={120} />
            <Text className="text-lg font-black text-foreground">No meals yet</Text>
            <Text className="text-center text-muted-foreground">Your logged days — and a calorie chart — show up here once you log a meal.</Text>
          </Card>
        ) : (
          <>
            <Card style={{ backgroundColor: block.lilac, borderColor: "transparent" }} className="p-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Kicker className="text-black/60">Plate index</Kicker>
                  <Text className="mt-1 text-2xl font-black tracking-tight text-black">Calories</Text>
                </View>
                <SegmentedToggle options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }]} value={range} onChange={setRange} />
              </View>
              <View className="mt-4">
                <BarChart data={chartData.map((d) => ({ label: d.day, value: d.calories }))} goal={goals?.daily_calories} />
              </View>
              {goals ? (
                <Text className="mt-1 text-right text-[11px] text-black/60">Goal {goals.daily_calories.toLocaleString()} cal</Text>
              ) : null}
              {insight ? (
                <View className="mt-3 border-t border-black/15 pt-3">
                  <Text className="text-xs font-bold tabular-nums text-black/60">
                    Avg {insight.avg.toLocaleString()} cal across {insight.logged} logged {insight.logged === 1 ? "day" : "days"}
                    {insight.onTarget > 0 ? ` · ${insight.onTarget} on target` : ""}
                  </Text>
                </View>
              ) : null}
            </Card>

            <View className="gap-3">
              {days.map((day) => {
                const isOpen = expanded === day.date;
                const overGoal = goals !== null && day.calories > goalForDate(day.date, goals.daily_calories);
                return (
                  <Animated.View key={day.date} layout={reduce ? undefined : LinearTransition.duration(130).easing(Easing.out(Easing.quad))}>
                    <Card className="p-4">
                      <Pressable
                        className="min-h-11 flex-row items-center gap-2"
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                        onPress={() => setExpanded(isOpen ? null : day.date)}
                      >
                        <Text className="flex-1 text-lg font-black tracking-tight text-foreground">{day.label}</Text>
                        <View className="flex-row items-center gap-1">
                          {overGoal ? <Feather name="trending-up" size={13} color={colors.destructive} /> : null}
                          <Text className={`text-sm font-semibold tabular-nums ${overGoal ? "text-destructive" : "text-foreground"}`}>{day.calories} cal</Text>
                        </View>
                        <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                      </Pressable>
                      {isOpen ? (
                        <View className="mt-2 gap-2">
                          {day.meals.map((meal, i) => (
                            <Animated.View key={meal.id} entering={reduce ? undefined : FadeIn.delay(i * 30)}>
                              <MealListItem meal={meal} onPress={() => setSelected(meal)} onChanged={load} />
                            </Animated.View>
                          ))}
                        </View>
                      ) : null}
                    </Card>
                  </Animated.View>
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
