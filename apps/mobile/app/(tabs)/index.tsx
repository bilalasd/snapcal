import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bevi } from "../../components/bevi";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { bucketOfHour, itemsToDraft, localDateString, mealTotals, tzOffsetMinutes, type ApiMeal, type Goals, type TrendsResponse } from "@loggi/shared";
import { fetchJson, fetchMealsForDate, fetchMealsRange } from "../../lib/api";
import { tapSuccess, tapLight } from "../../lib/haptics";
import { goalForDate, recordDailyGoal } from "../../lib/goal-history";
import {
  addOptimisticMeal,
  discardOptimistic,
  getCachedMeals,
  reconcileMeals,
  getCachedGoals,
  setCachedGoals,
  getCachedRange,
  getCachedTrends,
  setCachedTrends,
  optimisticMeal,
  settleMeal,
} from "../../lib/cache";
import { Button, Card, Badge, Skeleton, Kicker } from "../../components/ui";
import { ProgressRing } from "../../components/progress-ring";
import { MealListItem } from "../../components/meal-list-item";
import { MealDrawer } from "../../components/meal-drawer";
import { DayPickerSheet } from "../../components/day-picker-sheet";
import { MondayNoteCard } from "../../components/monday-note-card";
import { MilestoneCard } from "../../components/milestone-card";
import { checkMilestones, markMilestoneSeen, type Milestone } from "../../lib/milestones";
import { useColors, block } from "../../lib/colors";

// Fixed dark inks — these bars always sit on the pastel lime hero card, so they
// must not track the theme (a themed fill goes dark-on-dark in dark mode).
const MACRO_INK: Record<string, string> = { Protein: "#000000", Carbs: "rgba(0,0,0,0.7)", Fat: "rgba(0,0,0,0.5)" };

// Fill bar that eases to its new width on data changes (130ms, reduced-motion
// aware) instead of snapping.
function MacroFill({ pct, color }: { pct: number; color: string }) {
  const reduce = useReducedMotion();
  const width = useSharedValue(pct);
  useEffect(() => {
    width.value = reduce ? pct : withTiming(pct, { duration: 130, easing: Easing.out(Easing.quad) });
  }, [pct, reduce, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return <Animated.View style={[{ height: "100%", backgroundColor: color }, style]} />;
}

const BUCKET_MEAL: Record<string, string> = { morning: "breakfast", midday: "lunch", evening: "dinner", night: "snack" };

// ponytail: in-memory dismiss — a restart resurfacing the card is fine.
let usualDismissedOn: string | null = null;
// The suggestion only changes when the time-of-day bucket does, so remember
// the last answer per (date, bucket) — tab focuses stop re-running the
// server's 45-day meal scan.
let usualMemo: { key: string; meal: ApiMeal | null } | null = null;

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
  const colors = useColors();
  const reduce = useReducedMotion();
  const [today] = useState(() => localDateString());
  const [date, setDate] = useState(today);
  const [meals, setMeals] = useState<ApiMeal[] | null>(() => getCachedMeals(localDateString()) ?? null);
  const [goals, setGoals] = useState<Goals | null>(() => getCachedGoals());
  const [streak, setStreak] = useState<number | null>(null);
  const [daySums, setDaySums] = useState<Map<string, number> | null>(null);
  const [trends, setTrends] = useState<TrendsResponse | null>(() => getCachedTrends<TrendsResponse>());
  const [mondayVisible, setMondayVisible] = useState(false);
  const [selected, setSelected] = useState<ApiMeal | null>(null);
  const [usual, setUsual] = useState<ApiMeal | null>(null);
  const [longGap, setLongGap] = useState(false);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isToday = date === today;

  const load = useCallback((forDate: string) => {
    const cached = getCachedMeals(forDate);
    if (cached) setMeals(cached); // instant — stale-while-revalidate
    else setMeals(null); // skeleton only when we have nothing
    return fetchMealsForDate(forDate)
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
  useFocusEffect(useCallback(() => void load(date), [load, date]));

  // "Your usual" is time-of-day dependent: checked on focus, fetched only
  // when the (date, bucket) actually changed since the last answer.
  useFocusEffect(
    useCallback(() => {
      if (!isToday || usualDismissedOn === today) return;
      const key = `${today}:${bucketOfHour(new Date().getHours())}`;
      if (usualMemo?.key === key) {
        setUsual(usualMemo.meal);
        return;
      }
      fetchJson<{ meal: ApiMeal | null }>(`/api/meals/suggestions?tz_offset=${tzOffsetMinutes()}`)
        .then((r) => {
          usualMemo = { key, meal: r.meal };
          setUsual(r.meal);
        })
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
    // cached copy means the round trip is pure waste. No cache means this one
    // request decides whether a brand-new user ever reaches onboarding, so a
    // failure retries quietly instead of stranding them on an empty Today.
    let cancelled = false;
    const loadGoals = () => {
      if (cancelled) return;
      fetchJson<Goals>("/api/goals")
        .then((g) => {
          if (cancelled) return;
          if (!g.onboarded) router.replace("/onboarding");
          else {
            setGoals(g);
            setCachedGoals(g);
          }
        })
        .catch(() => setTimeout(loadGoals, 3000));
    };
    if (!getCachedGoals()) loadGoals();
    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const countStreak = (rows: ApiMeal[]) => {
      const sums = new Map<string, number>();
      for (const m of rows) {
        if (m.planned || new Date(m.eatenAt) < weekAgo) continue;
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
    return () => {
      cancelled = true;
    };
  }, [router]);

  // One trends fetch feeds the smart goal (server-computed weekly, frozen
  // each Monday from the weight trend) and the Monday note (verdict + recap) —
  // through the same shared cache the Weight tab and post-save prefetch warm,
  // so whichever screen fetched last saves everyone else the round trip.
  const loadTrends = useCallback(
    () =>
      fetchJson<TrendsResponse>(`/api/trends?days=90&tz_offset=${tzOffsetMinutes()}`)
        .then((t) => {
          setCachedTrends(t);
          setTrends(t);
        })
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    void loadTrends();
  }, [loadTrends]);
  const trendGoal = goals?.adaptive_goal ? (trends?.adaptive_goal_kcal ?? null) : null;

  // Milestones ride the trends load, off the critical path — one card at a
  // time, dismissed forever once seen.
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  useEffect(() => {
    if (!trends) return;
    let alive = true;
    checkMilestones(trends).then((m) => {
      if (alive) setMilestone(m);
    });
    return () => {
      alive = false;
    };
  }, [trends]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(date), loadTrends()]);
    setRefreshing(false);
  }, [load, loadTrends, date]);

  const totals = (meals ?? []).reduce(
    (acc, meal) => {
      if (meal.planned) return acc; // reserved, not eaten
      const t = mealTotals(meal);
      return { calories: acc.calories + t.calories, protein: acc.protein + t.protein, carbs: acc.carbs + t.carbs, fat: acc.fat + t.fat };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  // Pre-logged meals reserve budget: they reduce "still available" without
  // counting as eaten until confirmed.
  const reserved = (meals ?? []).reduce((s, m) => s + (m.planned ? mealTotals(m).calories : 0), 0);

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
  // Each day is judged by the goal that was in effect then (lib/goal-history),
  // so Monday's smart-goal change doesn't rewrite last week's wins.
  const onTarget = daySums
    ? Array.from(daySums.entries()).filter(([d, c]) => d !== today && c > 0 && c <= goalForDate(d, dailyGoal)).length
    : 0;
  const remaining = goals ? dailyGoal - totals.calories - reserved : 0;
  // Gate the usual-meal card so it never double-stacks with the empty-state
  // Bevi (one Bevi per screen): the card owns the Bevi when both would show.
  const showUsual =
    meals !== null &&
    isToday &&
    !!usual &&
    usualDismissedOn !== today &&
    !meals.some((m) => m.name.trim().toLowerCase() === usual.name.trim().toLowerCase());
  const headline = isToday ? greetingFor(new Date().getHours()) : dayHeading(date, today);
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const goAdd = () => router.push(isToday ? "/add" : { pathname: "/add", params: { date } });

  // The day the screen is showing is the goal the user is aiming at — record
  // it so future Mondays can't re-grade this day (see lib/goal-history).
  useEffect(() => {
    if (goals && dailyGoal > 0) recordDailyGoal(today, dailyGoal);
  }, [goals, dailyGoal, today]);

  const goPrev = useCallback(() => {
    tapLight();
    setDate((d) => addDays(d, -1));
  }, []);
  const goNext = useCallback(() => {
    if (date >= today) return;
    tapLight();
    setDate(addDays(date, 1));
  }, [date, today]);
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
      <ScrollView
        contentContainerClassName="p-5 pb-28 gap-5"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.mutedForeground} />}
      >
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Kicker>{dateLabel}</Kicker>
            <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">{headline}</Text>
          </View>
          {isToday && streak !== null && streak > 0 ? (
            <View className="items-end gap-1.5">
              <Badge className="bg-accent-log" accessibilityLabel={`${streak} of 7 days logged this week`}>
                <Feather name="zap" size={12} color="#fff" />
                <Text className="text-xs font-bold uppercase text-white">{streak}/7</Text>
              </Badge>
              {onTarget > 0 ? (
                <Badge className="bg-block-mint" accessibilityLabel={`${onTarget} days on target this week`}>
                  <Feather name="check" size={12} color="#000" />
                  <Text className="text-xs font-bold uppercase text-black">{onTarget} on target</Text>
                </Badge>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Day navigation */}
        <View className="flex-row items-center justify-between border-t border-border pt-3">
          <Button variant="outline" size="icon" accessibilityLabel="Previous day" onPress={goPrev}>
            <Feather name="chevron-left" size={20} color={colors.foreground} />
          </Button>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Jump to a day"
            onPress={() => setDayPickerOpen(true)}
            className="min-h-11 flex-row items-center gap-1 active:opacity-60"
          >
            <Text className="text-muted-foreground text-xs font-extrabold uppercase tracking-[2px]">
              {isToday ? "Today" : dayHeading(date, today)}
            </Text>
            <Feather name="chevron-down" size={12} color={colors.mutedForeground} />
          </Pressable>
          <Button variant="outline" size="icon" accessibilityLabel="Next day" disabled={isToday} onPress={goNext}>
            <Feather name="chevron-right" size={20} color={colors.foreground} />
          </Button>
        </View>

        {meals === null || !goals ? (
          <View className="gap-4">
            <Skeleton className="mx-auto h-52 w-52 rounded-full" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </View>
        ) : (
          <>
            {isToday && trends?.recap ? (
              <MondayNoteCard
                note={{
                  weekStart: trends.recap.week_start,
                  content: trends.recap.content,
                  verdictStatus: trends.verdict.status,
                  goalKcal: goals.adaptive_goal ? trends.adaptive_goal_kcal : null,
                  audit: trends.audit ?? null,
                }}
                showBevi={!showUsual}
                onVisible={setMondayVisible}
              />
            ) : null}

            {isToday && milestone ? (
              <MilestoneCard
                milestone={milestone}
                onDone={() => {
                  void markMilestoneSeen(milestone.id);
                  setMilestone(null);
                }}
              />
            ) : null}

            <Card style={{ backgroundColor: block.lime, borderColor: "transparent" }} className="p-4">
              <View className="flex-row justify-between gap-4">
                <View className="flex-1 justify-between">
                  <View>
                    <Kicker className="text-black">{remaining >= 0 ? "Still available" : "Over target"}</Kicker>
                    <Text className={`mt-1 text-6xl font-black tracking-tighter tabular-nums ${remaining < 0 ? "text-[#d92d20]" : "text-black"}`}>
                      {Math.abs(remaining).toLocaleString()}
                    </Text>
                    <Text className="text-sm font-bold uppercase tracking-[2px] text-black/60">
                      cal {remaining >= 0 ? "left" : "over"}
                    </Text>
                  </View>
                  <View className="mt-4 gap-0.5">
                    <Text className="text-xs font-semibold text-black/60">
                      {totals.calories.toLocaleString()} of {dailyGoal.toLocaleString()} eaten
                    </Text>
                    {reserved > 0 ? (
                      <Text className="text-xs font-semibold text-black/60">
                        {reserved.toLocaleString()} reserved for later
                      </Text>
                    ) : null}
                    {goals.adaptive_goal ? (
                      <Text className="text-xs text-black/60">
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

              <View className="mt-4 gap-3 border-t border-black/15 pt-4">
                {macros.map(({ label, value, max }) => (
                  <View key={label} className="flex-row items-center gap-3">
                    <Text numberOfLines={1} className="w-20 text-xs font-extrabold uppercase tracking-[1px] text-black">{label}</Text>
                    <View className="h-2 flex-1 overflow-hidden bg-black/10">
                      <MacroFill pct={max > 0 ? Math.min((value / max) * 100, 100) : 0} color={MACRO_INK[label]} />
                    </View>
                    <Text className="w-24 text-right text-xs font-bold tabular-nums text-black/60">
                      {Math.round(value)}/{max}g · {max > 0 ? Math.round((value / max) * 100) : 0}%
                    </Text>
                  </View>
                ))}
              </View>
            </Card>

            {showUsual && usual ? (
              <Card style={{ backgroundColor: block.cream, borderColor: "transparent" }} className="p-4">
                <View className="flex-row items-center gap-3">
                  <Bevi pose="clipboard" size={56} />
                  <View className="min-w-0 flex-1">
                    <Kicker className="text-black/60">Your usual {BUCKET_MEAL[bucketOfHour(new Date().getHours())]}?</Kicker>
                    <Text numberOfLines={1} className="mt-0.5 text-base font-black tracking-tight text-black">
                      {usual.name}
                    </Text>
                    <Text className="text-xs font-bold tabular-nums text-black/60">
                      {mealTotals(usual).calories.toLocaleString()} cal
                    </Text>
                  </View>
                  <Button size="sm" hitSlop={8} onPress={() => logUsual(usual)}>Log it</Button>
                  <Button variant="ghost" size="icon" accessibilityLabel="Dismiss suggestion" onPress={dismissUsual}>
                    <Feather name="x" size={18} color="#000" />
                  </Button>
                </View>
              </Card>
            ) : null}

            {meals.length === 0 ? (
              <Card className="items-center gap-3 p-8">
                {!showUsual && !mondayVisible ? <Bevi pose="standing" size={120} /> : null}
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
                      <Feather name="plus" size={14} color={colors.foreground} />
                      <Text className="font-bold text-foreground">Add to this day</Text>
                    </Pressable>
                  ) : null}
                </View>
                {meals.map((meal, i) => (
                  <Animated.View
                    key={meal.id}
                    entering={reduce ? undefined : FadeInDown.delay(i * 40).duration(130).easing(Easing.out(Easing.quad))}
                    layout={reduce ? undefined : LinearTransition.duration(130).easing(Easing.out(Easing.quad))}
                  >
                    <MealListItem meal={meal} onPress={() => setSelected(meal)} onChanged={() => load(date)} />
                  </Animated.View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
      </GestureDetector>

      <MealDrawer meal={selected} onClose={() => setSelected(null)} onChanged={() => load(date)} />
      <DayPickerSheet open={dayPickerOpen} onClose={() => setDayPickerOpen(false)} value={date} today={today} onSelect={setDate} />
    </SafeAreaView>
  );
}
