import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bevi } from "../../components/bevi";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, { Easing, FadeInDown, LinearTransition, runOnJS } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { bucketOfHour, itemsToDraft, localDateString, mealTotals, tzOffsetMinutes, type ApiMeal, type Goals } from "@loggi/shared";
import { fetchJson, fetchMealsForDate, fetchMealsRange } from "../../lib/api";
import { tapSuccess } from "../../lib/haptics";
import {
  addOptimisticMeal,
  discardOptimistic,
  getCachedMeals,
  reconcileMeals,
  getCachedGoals,
  setCachedGoals,
  getCachedRange,
  optimisticMeal,
  settleMeal,
} from "../../lib/cache";
import { Button, Card, Badge, Skeleton, Kicker } from "../../components/ui";
import { ProgressRing } from "../../components/progress-ring";
import { MealListItem } from "../../components/meal-list-item";
import { MealDrawer } from "../../components/meal-drawer";

const MACRO_BG: Record<string, string> = { Protein: "bg-chart-5", Carbs: "bg-chart-3", Fat: "bg-chart-2" };

const BUCKET_MEAL: Record<string, string> = { morning: "breakfast", midday: "lunch", evening: "dinner", night: "snack" };

// ponytail: in-memory dismiss — a restart resurfacing the card is fine.
let usualDismissedOn: string | null = null;

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
  const [daySums, setDaySums] = useState<Map<string, number> | null>(null);
  const [trendGoal, setTrendGoal] = useState<number | null>(null);
  const [selected, setSelected] = useState<ApiMeal | null>(null);
  const [usual, setUsual] = useState<ApiMeal | null>(null);
  const [longGap, setLongGap] = useState(false);

  const isToday = date === today;

  const load = useCallback((forDate: string) => {
    const cached = getCachedMeals(forDate);
    if (cached) setMeals(cached); // instant — stale-while-revalidate
    else setMeals(null); // skeleton only when we have nothing
    fetchMealsForDate(forDate)
      .then((m) => {
        setMeals(reconcileMeals(forDate, m));
        // Prefetch the previous day so swiping back never hits a skeleton.
        const prev = addDays(forDate, -1);
        if (!getCachedMeals(prev)) {
          fetchMealsForDate(prev).then((pm) => reconcileMeals(prev, pm)).catch(() => {});
        }
      })
      .catch(() => setMeals(cached ?? []));
  }, []);

  // Covers mount, date changes, and returning to the tab (e.g. after saving).
  useFocusEffect(useCallback(() => load(date), [load, date]));

  // "Your usual" is time-of-day dependent, so refresh it on every focus.
  useFocusEffect(
    useCallback(() => {
      if (!isToday || usualDismissedOn === today) return;
      fetchJson<{ meal: ApiMeal | null }>(`/api/meals/suggestions?tz_offset=${tzOffsetMinutes()}`)
        .then((r) => setUsual(r.meal))
        .catch(() => {}); // no suggestion is a fine outcome, never an error state
    }, [isToday, today]),
  );

  // One-tap "Log it" — optimistic, same shape as quick-log in the add flow.
  function logUsual(meal: ApiMeal) {
    const items = itemsToDraft(meal).filter((i) => i.name.trim());
    if (items.length === 0) return;
    const eatenAt = new Date().toISOString();
    const photosPayload = meal.photos.map((p) => ({ url: p.url, pathname: p.pathname }));

    const optimistic = optimisticMeal({ name: meal.name, items, source: "copy", photos: photosPayload }, eatenAt, []);
    addOptimisticMeal(optimistic);
    setUsual(null);
    setMeals(getCachedMeals(today) ?? [optimistic]);
    tapSuccess();

    fetchJson("/api/meals", {
      method: "POST",
      body: JSON.stringify({ name: meal.name || "Meal", eaten_at: eatenAt, source: "copy", items, photos: photosPayload }),
    })
      .then(() => settleMeal(optimistic.id))
      .catch((err) => {
        discardOptimistic(optimistic.id);
        setMeals(getCachedMeals(today) ?? []);
        Alert.alert("That didn't save", err instanceof Error ? err.message : "Check your connection and try again.");
      });
  }

  function dismissUsual() {
    usualDismissedOn = today;
    setUsual(null);
  }

  useEffect(() => {
    // Goals only change via Settings/onboarding, which write the cache — so a
    // cached copy means the round trip is pure waste.
    if (!getCachedGoals()) {
      fetchJson<Goals>("/api/goals")
        .then((g) => {
          if (!g.onboarded) router.replace("/onboarding");
          else {
            setGoals(g);
            setCachedGoals(g);
          }
        })
        .catch(() => {});
    }
    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const countStreak = (rows: ApiMeal[]) => {
      const sums = new Map<string, number>();
      for (const m of rows) {
        if (new Date(m.eatenAt) < weekAgo) continue;
        const d = localDateString(new Date(m.eatenAt));
        sums.set(d, (sums.get(d) ?? 0) + mealTotals(m).calories);
      }
      setStreak(Math.min(sums.size, 7));
      setDaySums(sums);
      // 3+ quiet days → greet the return warmly instead of an empty scold.
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      setLongGap(!rows.some((m) => new Date(m.eatenAt) >= threeDaysAgo));
    };
    // History's 30-day range cache already contains this week; optimistic adds
    // keep it current, so only a cold start pays for the fetch.
    const cachedRange = getCachedRange();
    if (cachedRange) countStreak(cachedRange);
    else fetchMealsRange(weekAgo, new Date()).then(countStreak).catch(() => {});
  }, [router]);

  // Smart goal: server-computed weekly (frozen each Monday from the weight
  // trend). Stays null (→ manual goal) until the trend has enough data.
  useEffect(() => {
    if (!goals?.adaptive_goal) {
      setTrendGoal(null);
      return;
    }
    fetchJson<{ adaptive_goal_kcal: number | null }>(`/api/trends?days=30&tz_offset=${tzOffsetMinutes()}`)
      .then((t) => setTrendGoal(t.adaptive_goal_kcal))
      .catch(() => setTrendGoal(null));
  }, [goals?.adaptive_goal]);

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

  const dailyGoal = trendGoal ?? goals?.daily_calories ?? 0;
  // Soft rolling counter, not a breakable chain: completed logged days this
  // week at or under target. Today is excluded — a half-logged day isn't a win.
  // ponytail: judges past days by the current goal; per-day goal history if it matters.
  const onTarget = daySums
    ? Array.from(daySums.entries()).filter(([d, c]) => d !== today && c > 0 && c <= dailyGoal).length
    : 0;
  const remaining = goals ? dailyGoal - totals.calories : 0;
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
      <ScrollView contentContainerClassName="p-5 pb-16 gap-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Kicker>{dateLabel}</Kicker>
            <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">{headline}</Text>
          </View>
          {isToday && streak !== null && streak > 0 ? (
            <View className="items-end gap-1.5">
              <Badge className="bg-magenta" accessibilityLabel={`${streak} of 7 days logged this week`}>
                <Feather name="zap" size={12} color="#fff" />
                <Text className="text-xs font-bold uppercase text-white">{streak}/7</Text>
              </Badge>
              {onTarget > 0 ? (
                <Badge className="bg-block-mint" accessibilityLabel={`${onTarget} days on target this week`}>
                  <Feather name="check" size={12} color="#000" />
                  <Text className="text-xs font-bold uppercase text-foreground">{onTarget} on target</Text>
                </Badge>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Day navigation */}
        <View className="flex-row items-center justify-between border-t border-border pt-3">
          <Button variant="outline" size="icon" accessibilityLabel="Previous day" onPress={goPrev}>
            <Feather name="chevron-left" size={20} color="#000" />
          </Button>
          <Text className="text-muted-foreground text-xs font-extrabold uppercase tracking-[2px]">
            {isToday ? "Tap arrows for past days" : dayHeading(date, today)}
          </Text>
          <Button variant="outline" size="icon" accessibilityLabel="Next day" disabled={isToday} onPress={goNext}>
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
                  <View className="mt-4 gap-0.5">
                    <Text className="text-xs font-semibold text-muted-foreground">
                      {totals.calories.toLocaleString()} of {dailyGoal.toLocaleString()} eaten
                    </Text>
                    {goals.adaptive_goal ? (
                      <Text className="text-xs text-muted-foreground">
                        {trendGoal !== null
                          ? "Smart goal — set from your weight trend, updates Mondays"
                          : "Smart goal needs more logging — using your manual target"}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <ProgressRing
                  value={totals.calories}
                  max={dailyGoal}
                  label={`${Math.min(Math.round((totals.calories / dailyGoal) * 100), 999)}%`}
                  sublabel="logged"
                  size="compact"
                />
              </View>

              <View className="mt-4 gap-3 border-t border-foreground/15 pt-4">
                {macros.map(({ label, value, max }) => (
                  <View key={label} className="flex-row items-center gap-3">
                    <Text numberOfLines={1} className="w-20 text-xs font-extrabold uppercase tracking-[1px] text-foreground">{label}</Text>
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

            {isToday && usual && usualDismissedOn !== today &&
            !meals.some((m) => m.name.trim().toLowerCase() === usual.name.trim().toLowerCase()) ? (
              <Card className="border-transparent bg-block-cream p-4">
                <View className="flex-row items-center gap-3">
                  <Bevi pose="clipboard" size={56} />
                  <View className="min-w-0 flex-1">
                    <Kicker>Your usual {BUCKET_MEAL[bucketOfHour(new Date().getHours())]}?</Kicker>
                    <Text numberOfLines={1} className="mt-0.5 text-base font-black tracking-tight text-foreground">
                      {usual.name}
                    </Text>
                    <Text className="text-xs font-bold tabular-nums text-muted-foreground">
                      {mealTotals(usual).calories.toLocaleString()} cal
                    </Text>
                  </View>
                  <Button size="sm" onPress={() => logUsual(usual)}>Log it</Button>
                  <Button variant="ghost" size="icon" accessibilityLabel="Dismiss suggestion" onPress={dismissUsual}>
                    <Feather name="x" size={18} color="#000" />
                  </Button>
                </View>
              </Card>
            ) : null}

            {meals.length === 0 ? (
              <Card className="items-center gap-3 p-8">
                <Bevi pose="standing" size={120} />
                <Text className="text-lg font-black tracking-tight text-foreground">
                  {isToday ? (longGap ? "Welcome back!" : "Nothing logged yet") : "No meals this day"}
                </Text>
                <Text className="text-center text-muted-foreground">
                  {isToday
                    ? longGap
                      ? "No catch-up needed — the past is logged or it isn't. Just snap your next meal."
                      : "Snap a photo of your next meal to get started."
                    : "Add a meal to log it for this day."}
                </Text>
                <Button onPress={goAdd}>Log a meal</Button>
              </Card>
            ) : (
              <View className="gap-3">
                <View className="flex-row items-center justify-between border-t border-border pt-3">
                  <Kicker>Meal journal</Kicker>
                  {!isToday ? (
                    <Pressable
                      className="min-h-11 flex-row items-center gap-1 active:opacity-60"
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: "/add", params: { date } })}
                    >
                      <Feather name="plus" size={14} color="#000" />
                      <Text className="font-bold text-foreground">Add to this day</Text>
                    </Pressable>
                  ) : null}
                </View>
                {meals.map((meal, i) => (
                  <Animated.View
                    key={meal.id}
                    entering={FadeInDown.delay(i * 40).duration(130).easing(Easing.out(Easing.quad))}
                    layout={LinearTransition.duration(130).easing(Easing.out(Easing.quad))}
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

      <MealDrawer meal={selected} onClose={() => setSelected(null)} onChanged={() => load(date)} />
    </SafeAreaView>
  );
}
