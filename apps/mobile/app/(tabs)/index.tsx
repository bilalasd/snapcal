import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bevi } from "../../components/bevi";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, LinearTransition, runOnJS } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { localDateString, mealTotals, type ApiMeal, type Goals } from "@loggi/shared";
import { fetchJson, fetchMealsForDate, fetchMealsRange } from "../../lib/api";
import { getCachedMeals, setCachedMeals, getCachedGoals, setCachedGoals } from "../../lib/cache";
import { Button, Card, Badge, Skeleton, Kicker } from "../../components/ui";
import { ProgressRing } from "../../components/progress-ring";
import { MealListItem } from "../../components/meal-list-item";
import { MealDrawer } from "../../components/meal-drawer";

const MACRO_BG: Record<string, string> = { Protein: "bg-chart-5", Carbs: "bg-chart-3", Fat: "bg-chart-2" };

function greetingFor(hour: number): string {
  if (hour < 5) return "Late night snack?";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

function dayHeading(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export default function Today() {
  const router = useRouter();
  const [today] = useState(() => localDateString());
  const [date, setDate] = useState(today);
  const [meals, setMeals] = useState<ApiMeal[] | null>(() => getCachedMeals(localDateString()) ?? null);
  const [goals, setGoals] = useState<Goals | null>(() => getCachedGoals());
  const [streak, setStreak] = useState<number | null>(null);
  const [selected, setSelected] = useState<ApiMeal | null>(null);

  const isToday = date === today;

  const load = useCallback((forDate: string, showLoading = true) => {
    const cached = getCachedMeals(forDate);
    if (cached) setMeals(cached); // instant — stale-while-revalidate
    else if (showLoading) setMeals(null); // skeleton only when we have nothing
    fetchMealsForDate(forDate)
      .then((m) => {
        setMeals(m);
        setCachedMeals(forDate, m);
      })
      .catch(() => setMeals(cached ?? []));
  }, []);

  useEffect(() => load(date), [load, date]);

  // Refresh silently when returning to the tab (e.g. after saving a meal).
  useFocusEffect(useCallback(() => load(date, false), [load, date]));

  useEffect(() => {
    fetchJson<Goals>("/api/goals")
      .then((g) => {
        if (!g.onboarded) router.replace("/onboarding");
        else {
          setGoals(g);
          setCachedGoals(g);
        }
      })
      .catch(() => {});
    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    fetchMealsRange(weekAgo, new Date())
      .then((weekMeals) => {
        const days = new Set(weekMeals.map((m) => localDateString(new Date(m.eatenAt))));
        setStreak(Math.min(days.size, 7));
      })
      .catch(() => {});
  }, [router]);

  const totals = (meals ?? []).reduce(
    (acc, meal) => {
      const t = mealTotals(meal);
      return { calories: acc.calories + t.calories, protein: acc.protein + t.protein, carbs: acc.carbs + t.carbs, fat: acc.fat + t.fat };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const macros = goals
    ? [
        { label: "Protein", value: totals.protein, max: goals.daily_protein_g },
        { label: "Carbs", value: totals.carbs, max: goals.daily_carbs_g },
        { label: "Fat", value: totals.fat, max: goals.daily_fat_g },
      ]
    : [];

  const remaining = goals ? goals.daily_calories - totals.calories : 0;
  const headline = isToday ? greetingFor(new Date().getHours()) : dayHeading(date, today);
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const goAdd = () => router.push(isToday ? "/add" : { pathname: "/add", params: { date } });

  const goPrev = useCallback(() => setDate((d) => addDays(d, -1)), []);
  const goNext = useCallback(() => setDate((d) => (d < today ? addDays(d, 1) : d)), [today]);
  // Swipe left/right to page days (activeOffsetX keeps vertical scroll working).
  const swipeDays = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (e.translationX < -60) runOnJS(goNext)();
      else if (e.translationX > 60) runOnJS(goPrev)();
    });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <GestureDetector gesture={swipeDays}>
      <ScrollView contentContainerClassName="p-5 gap-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Kicker>{dateLabel}</Kicker>
            <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">{headline}</Text>
          </View>
          {isToday && streak !== null && streak > 0 ? (
            <Badge className="bg-magenta">
              <Feather name="zap" size={12} color="#fff" />
              <Text className="text-xs font-bold uppercase text-white">{streak}/7</Text>
            </Badge>
          ) : null}
        </View>

        {/* Day navigation */}
        <View className="flex-row items-center justify-between border-t border-border pt-3">
          <Button variant="outline" size="icon" onPress={goPrev}>
            <Feather name="chevron-left" size={20} color="#000" />
          </Button>
          <Text className="text-muted-foreground text-xs font-extrabold uppercase tracking-[2px]">
            {isToday ? "Tap arrows for past days" : dayHeading(date, today)}
          </Text>
          <Button variant="outline" size="icon" disabled={isToday} onPress={goNext}>
            <Feather name="chevron-right" size={20} color="#000" />
          </Button>
        </View>

        {meals === null || !goals ? (
          <View className="gap-4">
            <Skeleton className="mx-auto h-52 w-52 rounded-full" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </View>
        ) : (
          <>
            <Card className="border-transparent bg-block-lime p-4">
              <View className="flex-row justify-between gap-4">
                <View className="flex-1 justify-between">
                  <View>
                    <Kicker className="text-foreground">{remaining >= 0 ? "Still available" : "Over target"}</Kicker>
                    <Text className={`mt-1 text-6xl font-black tracking-tighter tabular-nums ${remaining < 0 ? "text-destructive" : "text-foreground"}`}>
                      {Math.abs(remaining).toLocaleString()}
                    </Text>
                    <Text className="text-sm font-bold uppercase tracking-[2px] text-muted-foreground">
                      cal {remaining >= 0 ? "left" : "over"}
                    </Text>
                  </View>
                  <Text className="mt-4 text-xs font-semibold text-muted-foreground">
                    {totals.calories.toLocaleString()} of {goals.daily_calories.toLocaleString()} eaten
                  </Text>
                </View>
                <ProgressRing
                  value={totals.calories}
                  max={goals.daily_calories}
                  label={`${Math.min(Math.round((totals.calories / goals.daily_calories) * 100), 999)}%`}
                  sublabel="logged"
                  size="compact"
                />
              </View>

              <View className="mt-4 gap-3 border-t border-foreground/15 pt-4">
                {macros.map(({ label, value, max }) => (
                  <View key={label} className="flex-row items-center gap-3">
                    <Text className="w-16 text-xs font-extrabold uppercase tracking-[1px] text-foreground">{label}</Text>
                    <View className="h-2 flex-1 overflow-hidden bg-muted">
                      <View className={`h-full ${MACRO_BG[label]}`} style={{ width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%` }} />
                    </View>
                    <Text className="w-24 text-right text-xs font-bold tabular-nums text-muted-foreground">
                      {Math.round(value)}/{max}g · {max > 0 ? Math.round((value / max) * 100) : 0}%
                    </Text>
                  </View>
                ))}
              </View>
            </Card>

            {meals.length === 0 ? (
              <Card className="items-center gap-3 p-8">
                <Bevi pose="standing" size={120} />
                <Text className="text-lg font-black tracking-tight text-foreground">
                  {isToday ? "Nothing logged yet" : "No meals this day"}
                </Text>
                <Text className="text-center text-muted-foreground">
                  {isToday ? "Snap a photo of your next meal to get started." : "Add a meal to log it for this day."}
                </Text>
                <Button onPress={goAdd}>Log a meal</Button>
              </Card>
            ) : (
              <View className="gap-3">
                <View className="flex-row items-center justify-between border-t border-border pt-3">
                  <Kicker>Meal journal</Kicker>
                  {!isToday ? (
                    <Pressable className="flex-row items-center gap-1" onPress={() => router.push({ pathname: "/add", params: { date } })}>
                      <Feather name="plus" size={14} color="#000" />
                      <Text className="font-bold text-foreground">Add to this day</Text>
                    </Pressable>
                  ) : null}
                </View>
                {meals.map((meal, i) => (
                  <Animated.View
                    key={meal.id}
                    entering={FadeInDown.delay(i * 40).springify().damping(18)}
                    layout={LinearTransition.springify()}
                  >
                    <MealListItem meal={meal} onPress={() => setSelected(meal)} />
                  </Animated.View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
      </GestureDetector>

      <MealDrawer meal={selected} onClose={() => setSelected(null)} onChanged={() => load(date, false)} />
    </SafeAreaView>
  );
}
