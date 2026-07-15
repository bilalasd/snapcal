import { useCallback, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { tzOffsetMinutes } from "@loggi/shared";
import { fetchJson } from "../../lib/api";
import { syncAppleHealth } from "../../lib/apple-health";
import { getCachedGoals } from "../../lib/cache";
import { Card, Skeleton, Kicker, SegmentedToggle, Alert, Button } from "../../components/ui";
import { LogWeightDrawer } from "../../components/log-weight-drawer";
import { WeightChart } from "../../components/charts";
import { Bevi } from "../../components/bevi";

const KG_PER_LB = 0.453592;

interface TrendsResponse {
  weights: { date: string; weightKg: number; trendKg: number }[];
  rate_kg_per_week: number | null;
  balance: { avgIntakeKcal: number; tdeeKcal: number; actualDeficitKcal: number; loggedDays: number; weighIns: number } | null;
  verdict: { status: "collecting" | "on_track" | "adjust"; adjustKcal: number; neededDeficitKcal: number; actualDeficitKcal: number; missing: string[] };
  adaptive_goal_kcal: number | null;
  target_rate_kg_per_wk: number;
  goal_weight_kg: number | null;
  unit_system: "metric" | "imperial";
  recap: { week_start: string; content: string } | null;
}

// Stale-while-revalidate, same as the meals caches: last response shows
// instantly on focus, refresh happens in the background. Always fetches the
// 90-day window — 30d is a client-side slice, so the toggle is instant.
let trendsCache: TrendsResponse | null = null;

export default function Weight() {
  const [range, setRange] = useState<"30" | "90">("30");
  const [data, setData] = useState<TrendsResponse | null>(() => trendsCache);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(() => {
    const fetchTrends = () =>
      fetchJson<TrendsResponse>(`/api/trends?days=90&tz_offset=${tzOffsetMinutes()}`)
        .then((trends) => {
          trendsCache = trends;
          setData(trends);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load trends"));

    // Fire-and-forget: doesn't block the trends load, but refreshes it when
    // the sync actually pushed new weigh-ins.
    syncAppleHealth()
      .then((pushed) => {
        if (pushed) fetchTrends();
      })
      .catch(() => {});

    fetchTrends();
  }, []);
  useFocusEffect(useCallback(() => load(), [load]));

  const imperial = data?.unit_system === "imperial";
  const unit = imperial ? "lbs" : "kg";
  const toUnit = (kg: number) => (imperial ? kg / KG_PER_LB : kg);

  const rate = data?.rate_kg_per_week != null ? Math.round(toUnit(data.rate_kg_per_week) * 100) / 100 : null;
  const latest = data && data.weights.length > 0 ? data.weights[data.weights.length - 1] : null;
  // Date.now() per render: tabs stay mounted for days, a frozen timestamp goes stale.
  const daysSince = latest ? Math.floor((Date.now() - new Date(`${latest.date}T12:00:00`).getTime()) / 86_400_000) : null;
  const rangeCutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const chartWeights = data ? (range === "30" ? data.weights.filter((w) => w.date >= rangeCutoff) : data.weights) : [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="p-5 pb-16 gap-5">
        <View className="flex-row items-start justify-between gap-4">
          <View>
            <Kicker>Trend desk</Kicker>
            <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Weight</Text>
          </View>
          <Button size="sm" onPress={() => setLogOpen(true)}>
            <Feather name="plus" size={14} color="#fff" />
            <Text className="font-bold text-white">Log</Text>
          </Button>
        </View>

        {daysSince !== null && daysSince >= 4 ? (
          <Alert icon="alert-triangle" title="Time for a weigh-in">
            Your last weigh-in was {daysSince} days ago. Log one to keep your trend current.
          </Alert>
        ) : null}

        {error ? <Alert icon="alert-triangle" title="Couldn't load trends" variant="destructive">{error}</Alert> : null}

        {!data && !error ? (
          <View className="gap-5">
            <Skeleton className="h-72 w-full rounded-3xl" />
            <View className="flex-row gap-3">
              <Skeleton className="h-20 flex-1 rounded-3xl" />
              <Skeleton className="h-20 flex-1 rounded-3xl" />
            </View>
            <Skeleton className="h-16 w-full rounded-3xl" />
          </View>
        ) : null}

        {data ? (
          <>
            {data.weights.length === 0 ? (
              <Card className="items-center gap-2 p-8">
                <Bevi pose="standing" size={120} />
                <Text className="text-lg font-black text-foreground">No weight data yet</Text>
                <Text className="text-center text-muted-foreground">
                  Tap Log above to add a weigh-in — or connect Apple Health in Settings to sync automatically.
                </Text>
              </Card>
            ) : (
              <Card className="border-transparent bg-block-cream p-4">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Kicker>Latest weigh-in</Kicker>
                    <Text className="mt-1 text-5xl font-black tracking-tighter tabular-nums text-foreground">
                      {Math.round(toUnit(latest!.weightKg) * 10) / 10}
                      <Text className="text-2xl"> {unit}</Text>
                    </Text>
                    <Text className="mt-1 text-xs text-muted-foreground">
                      Trend {Math.round(toUnit(latest!.trendKg) * 10) / 10} {unit}
                    </Text>
                  </View>
                  <SegmentedToggle options={[{ value: "30", label: "30d" }, { value: "90", label: "90d" }]} value={range} onChange={setRange} />
                </View>
                <View className="mt-4">
                  <WeightChart
                    goal={data.goal_weight_kg != null ? Math.round(toUnit(data.goal_weight_kg) * 10) / 10 : undefined}
                    points={chartWeights.map((w) => ({
                      measured: Math.round(toUnit(w.weightKg) * 10) / 10,
                      trend: Math.round(toUnit(w.trendKg) * 10) / 10,
                      label: new Date(`${w.date}T12:00:00`).toLocaleDateString([], { month: "numeric", day: "numeric" }),
                    }))}
                  />
                </View>
              </Card>
            )}

            <View className="flex-row gap-3">
              <Card className="flex-1 p-4">
                <Text className="text-xs text-muted-foreground">Current rate</Text>
                <Text className="text-2xl font-black tracking-tight tabular-nums text-foreground">
                  {rate === null ? "—" : `${rate > 0 ? "+" : ""}${rate} ${unit}/wk`}
                </Text>
              </Card>
              <Card className="flex-1 p-4">
                <Text className="text-xs text-muted-foreground">Maintenance</Text>
                <Text className="text-2xl font-black tracking-tight tabular-nums text-foreground">
                  {data.balance ? `${data.balance.tdeeKcal} cal` : "—"}
                </Text>
              </Card>
            </View>

            {getCachedGoals()?.adaptive_goal && data.adaptive_goal_kcal != null ? (
              <Card className="p-4">
                <Text className="text-xs text-muted-foreground">This week's smart calorie goal</Text>
                <Text className="text-2xl font-black tracking-tight tabular-nums text-foreground">
                  {data.adaptive_goal_kcal.toLocaleString()} cal/day
                </Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Your measured maintenance minus the deficit your target rate needs, locked in from last Monday's
                  trend. It recalculates next Monday.
                </Text>
              </Card>
            ) : null}

            {data.verdict.status === "collecting" ? (
              <Alert icon="clock" title="Collecting data">
                The deficit verdict needs consistent logging first. Still needed: {data.verdict.missing.join(", ")}.
              </Alert>
            ) : data.verdict.status === "on_track" ? (
              <Alert icon="check-circle" title="On track">
                You're averaging a {Math.abs(data.verdict.actualDeficitKcal)} cal/day{" "}
                {data.verdict.actualDeficitKcal >= 0 ? "deficit" : "surplus"}, right around the{" "}
                {data.verdict.neededDeficitKcal} cal/day needed for your target rate.
              </Alert>
            ) : (
              <Alert icon="alert-triangle" title="Adjust intake">
                Your average {data.verdict.actualDeficitKcal >= 0 ? "deficit" : "surplus"} is{" "}
                {Math.abs(data.verdict.actualDeficitKcal)} cal/day; your target needs {data.verdict.neededDeficitKcal}{" "}
                cal/day. Eat about {Math.abs(data.verdict.adjustKcal)} cal/day {data.verdict.adjustKcal > 0 ? "less" : "more"} to hit it.
              </Alert>
            )}

            {data.balance ? (
              <Text className="text-xs text-muted-foreground">
                Based on {data.balance.loggedDays} logged days and {data.balance.weighIns} weigh-ins over ~2 weeks. Avg intake{" "}
                {data.balance.avgIntakeKcal} cal/day.
              </Text>
            ) : null}

            {data.recap ? (
              <Card className="border-transparent bg-block-coral p-4">
                <Text className="text-2xl font-black tracking-tight text-foreground">Weekly recap</Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  Week of {new Date(`${data.recap.week_start}T12:00:00`).toLocaleDateString([], { month: "long", day: "numeric" })}
                </Text>
                <Text className="mt-2 text-sm text-foreground">{data.recap.content}</Text>
              </Card>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <LogWeightDrawer open={logOpen} onClose={() => setLogOpen(false)} imperial={imperial} onLogged={load} />
    </SafeAreaView>
  );
}
