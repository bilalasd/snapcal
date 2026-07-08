"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, Hourglass, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LogWeightDrawer } from "@/components/log-weight-drawer";
import { fetchJson, tzOffsetMinutes } from "@/lib/client";

const KG_PER_LB = 0.453592;

const chartConfig = {
  weightKg: { label: "Weight", color: "var(--chart-2)" },
  trendKg: { label: "Trend", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface TrendsResponse {
  weights: Array<{ date: string; weightKg: number; trendKg: number }>;
  rate_kg_per_week: number | null;
  balance: {
    avgIntakeKcal: number;
    tdeeKcal: number;
    actualDeficitKcal: number;
    loggedDays: number;
    weighIns: number;
  } | null;
  verdict: {
    status: "collecting" | "on_track" | "adjust";
    adjustKcal: number;
    neededDeficitKcal: number;
    actualDeficitKcal: number;
    missing: string[];
  };
  target_rate_kg_per_wk: number;
  goal_weight_kg: number | null;
  unit_system: "metric" | "imperial";
  recap: { week_start: string; content: string } | null;
}

export default function WeightPage() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<"30" | "90">("30");
  const [refreshKey, setRefreshKey] = useState(0);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Opportunistic weight sync (server throttles to 1/hour)
      await fetch("/api/health/sync", { method: "POST" }).catch(() => {});
      const trends = await fetchJson<TrendsResponse>(
        `/api/trends?days=${range}&tz_offset=${tzOffsetMinutes()}`,
      );
      if (!cancelled) {
        setData(trends);
        setError(null);
      }
    })().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Failed to load trends");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [range, refreshKey]);

  const imperial = data?.unit_system === "imperial";
  const unit = imperial ? "lbs" : "kg";
  const toUnit = (kg: number) => (imperial ? kg / KG_PER_LB : kg);

  const chartData =
    data?.weights.map((w) => ({
      ...w,
      weight: Math.round(toUnit(w.weightKg) * 10) / 10,
      trend: Math.round(toUnit(w.trendKg) * 10) / 10,
      label: new Date(`${w.date}T12:00:00`).toLocaleDateString([], {
        month: "numeric",
        day: "numeric",
      }),
    })) ?? [];

  const rate =
    data?.rate_kg_per_week != null
      ? Math.round(toUnit(data.rate_kg_per_week) * 100) / 100
      : null;

  // Days since the most recent weigh-in, to nudge when the trend is stale
  const lastWeighIn =
    data && data.weights.length > 0
      ? data.weights[data.weights.length - 1].date
      : null;
  const daysSinceWeighIn = lastWeighIn
    ? Math.floor(
        (nowMs - new Date(`${lastWeighIn}T12:00:00`).getTime()) / 86_400_000,
      )
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Weight</h1>
        <LogWeightDrawer
          imperial={imperial}
          onLogged={() => setRefreshKey((k) => k + 1)}
        />
      </div>

      {daysSinceWeighIn !== null && daysSinceWeighIn >= 4 ? (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Time for a weigh-in</AlertTitle>
          <AlertDescription>
            Your last weigh-in was {daysSinceWeighIn} days ago. Log one to keep
            your trend and rate current.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load trends</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!data && !error ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : null}

      {data ? (
        <>
          {data.weights.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No weight data yet</EmptyTitle>
                <EmptyDescription>
                  Tap Log weight above to add a weigh-in — or connect Google
                  Health in Settings to sync automatically.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Weight ({unit})</CardTitle>
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  value={[range]}
                  onValueChange={(v: string[]) =>
                    v[0] && setRange(v[0] as "30" | "90")
                  }
                >
                  <ToggleGroupItem value="30">30d</ToggleGroupItem>
                  <ToggleGroupItem value="90">90d</ToggleGroupItem>
                </ToggleGroup>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-52 w-full">
                  <ComposedChart data={chartData}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Scatter
                      dataKey="weight"
                      fill="var(--color-weightKg)"
                      opacity={0.5}
                    />
                    <Line
                      dataKey="trend"
                      stroke="var(--color-trendKg)"
                      strokeWidth={2.5}
                      dot={false}
                      type="monotone"
                      connectNulls
                    />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {(() => {
            if (
              !data.goal_weight_kg ||
              data.weights.length === 0 ||
              rate === null
            )
              return null;
            const currentKg = data.weights[data.weights.length - 1].trendKg;
            const toGoKg = currentKg - data.goal_weight_kg;
            const toGo = Math.abs(toUnit(toGoKg));
            const reached = Math.abs(toGoKg) < 0.2;
            // Weeks to goal from the trend rate (only if moving the right way)
            const rateKgPerWk = data.rate_kg_per_week ?? 0;
            const movingToward =
              (toGoKg > 0 && rateKgPerWk < 0) ||
              (toGoKg < 0 && rateKgPerWk > 0);
            const weeks =
              movingToward && rateKgPerWk !== 0
                ? Math.abs(toGoKg / rateKgPerWk)
                : null;
            const eta =
              weeks !== null
                ? new Date(nowMs + weeks * 7 * 86_400_000).toLocaleDateString(
                    [],
                    { month: "long", year: "numeric" },
                  )
                : null;
            return (
              <Card>
                <CardContent className="flex items-center justify-between px-4">
                  <div>
                    <p className="text-muted-foreground text-xs">
                      {reached ? "Goal reached" : "To go"}
                    </p>
                    <p className="text-lg font-bold tabular-nums">
                      {reached
                        ? "🎉 You're there"
                        : `${Math.round(toGo * 10) / 10} ${unit}`}
                    </p>
                  </div>
                  {eta && !reached ? (
                    <div className="text-right">
                      <p className="text-muted-foreground text-xs">
                        On track for
                      </p>
                      <p className="font-semibold">{eta}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
            <Card className="py-4">
              <CardContent className="px-4">
                <p className="text-muted-foreground text-xs">Current rate</p>
                <p className="text-lg font-semibold tabular-nums">
                  {rate === null
                    ? "—"
                    : `${rate > 0 ? "+" : ""}${rate} ${unit}/wk`}
                </p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="px-4">
                <p className="text-muted-foreground text-xs">
                  Maintenance (measured)
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {data.balance ? `${data.balance.tdeeKcal} kcal` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {data.verdict.status === "collecting" ? (
            <Alert>
              <Hourglass />
              <AlertTitle>Collecting data</AlertTitle>
              <AlertDescription>
                The deficit verdict needs consistent logging first. Still
                needed: {data.verdict.missing.join(", ")}.
              </AlertDescription>
            </Alert>
          ) : data.verdict.status === "on_track" ? (
            <Alert>
              <CheckCircle2 />
              <AlertTitle>On track</AlertTitle>
              <AlertDescription>
                You&apos;re averaging a{" "}
                {Math.abs(data.verdict.actualDeficitKcal)} kcal/day{" "}
                {data.verdict.actualDeficitKcal >= 0 ? "deficit" : "surplus"},
                right around the {data.verdict.neededDeficitKcal} kcal/day
                needed for your target rate.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <TriangleAlert />
              <AlertTitle>Adjust intake</AlertTitle>
              <AlertDescription>
                Your average{" "}
                {data.verdict.actualDeficitKcal >= 0 ? "deficit" : "surplus"} is{" "}
                {Math.abs(data.verdict.actualDeficitKcal)} kcal/day; your target
                rate needs {data.verdict.neededDeficitKcal} kcal/day. Eat about{" "}
                {Math.abs(data.verdict.adjustKcal)} kcal/day{" "}
                {data.verdict.adjustKcal > 0 ? "less" : "more"} to hit it.
              </AlertDescription>
            </Alert>
          )}

          {data.balance ? (
            <p className="text-muted-foreground text-xs">
              Based on {data.balance.loggedDays} logged days and{" "}
              {data.balance.weighIns} weigh-ins over the last ~2 weeks. Avg
              intake {data.balance.avgIntakeKcal} kcal/day.
            </p>
          ) : null}

          {data.recap ? (
            <Card>
              <CardHeader>
                <CardTitle>Weekly recap</CardTitle>
                <CardDescription>
                  Week of{" "}
                  {new Date(
                    `${data.recap.week_start}T12:00:00`,
                  ).toLocaleDateString([], { month: "long", day: "numeric" })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">
                  {data.recap.content}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
