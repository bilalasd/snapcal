"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis } from "recharts";
import { ChevronDown } from "lucide-react";
import {
  Card,
  CardContent,
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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { MealDrawer } from "@/components/meal-drawer";
import { MealListItem } from "@/components/meal-list-item";
import { cn } from "@/lib/utils";
import {
  fetchJson,
  fetchMealsRange,
  localDateString,
  mealTotals,
  type ApiMeal,
  type Goals,
} from "@/lib/client";

const chartConfig = {
  calories: { label: "Calories", color: "var(--chart-1)" },
} satisfies ChartConfig;

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
      label: new Date(`${date}T12:00:00`).toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      meals: dayMeals,
      calories: dayMeals.reduce((sum, m) => sum + mealTotals(m).calories, 0),
    }));
}

export default function HistoryPage() {
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

  const days = useMemo(() => groupByDay(meals ?? []), [meals]);

  const chartData = useMemo(() => {
    if (!today) return [];
    const anchor = new Date(`${today}T12:00:00`);
    const numDays = Number(range);
    const result: Array<{ day: string; calories: number }> = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(anchor.getTime() - i * 24 * 60 * 60 * 1000);
      const date = localDateString(d);
      const group = days.find((g) => g.date === date);
      result.push({
        day: d.toLocaleDateString([], { month: "numeric", day: "numeric" }),
        calories: group?.calories ?? 0,
      });
    }
    return result;
  }, [days, range, today]);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <p className="editorial-kicker">Archive</p>
        <h1 className="editorial-headline mt-1">History</h1>
      </section>

      {meals === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          <Card className="editorial-card editorial-cut">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <p className="editorial-kicker">Plate index</p>
                <CardTitle className="mt-1 text-2xl font-black tracking-[-0.06em]">
                  Calories
                </CardTitle>
              </div>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[range]}
                onValueChange={(v: string[]) =>
                  v[0] && setRange(v[0] as "7" | "30")
                }
              >
                <ToggleGroupItem value="7">7d</ToggleGroupItem>
                <ToggleGroupItem value="30">30d</ToggleGroupItem>
              </ToggleGroup>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-44 w-full">
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {goals ? (
                    <ReferenceLine
                      y={goals.daily_calories}
                      strokeDasharray="4 4"
                      className="stroke-muted-foreground"
                    />
                  ) : null}
                  <Bar
                    dataKey="calories"
                    fill="var(--color-calories)"
                    radius={4}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {days.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No meals yet</EmptyTitle>
                <EmptyDescription>
                  Your logged days will show up here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {days.map((day) => {
                const isOpen = expanded === day.date;
                const overGoal =
                  goals !== null && day.calories > goals.daily_calories;
                return (
                  <Card key={day.date} className="editorial-card py-3">
                    <CardContent className="flex flex-col gap-2 px-4">
                      <button
                        className="flex w-full items-center gap-2"
                        onClick={() => setExpanded(isOpen ? null : day.date)}
                      >
                        <span className="flex-1 text-left text-lg font-black tracking-[-0.04em]">
                          {day.label}
                        </span>
                        <span
                          className={cn(
                            "tabular-nums text-sm font-semibold",
                            overGoal ? "text-destructive" : "text-primary",
                          )}
                        >
                          {day.calories} kcal
                        </span>
                        <ChevronDown
                          className={cn(
                            "text-muted-foreground size-4 transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {isOpen ? (
                        <div className="flex flex-col gap-2">
                          {day.meals.map((meal) => (
                            <MealListItem
                              key={meal.id}
                              meal={meal}
                              onClick={() => setSelected(meal)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <MealDrawer
        meal={selected}
        onClose={() => setSelected(null)}
        onChanged={load}
      />
    </div>
  );
}
