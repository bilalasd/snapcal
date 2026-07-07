"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { MealDrawer } from "@/components/meal-drawer";
import { MealListItem } from "@/components/meal-list-item";
import { ProgressRing } from "@/components/progress-ring";
import {
  fetchJson,
  fetchMealsForDate,
  fetchMealsRange,
  localDateString,
  mealTotals,
  type ApiMeal,
  type Goals,
} from "@/lib/client";

const macroColors: Record<string, string> = {
  Protein: "bg-chart-5",
  Carbs: "bg-chart-3",
  Fat: "bg-chart-2",
};

function greetingFor(hour: number): string {
  if (hour < 5) return "Late night snack?";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function TodayPage() {
  const [meals, setMeals] = useState<ApiMeal[] | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [selected, setSelected] = useState<ApiMeal | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  const load = useCallback(() => {
    const current = new Date();
    fetchMealsForDate(localDateString(current))
      .then((rows) => {
        setMeals(rows);
        setNow(current);
      })
      .catch(() => setMeals([]));
    const weekAgo = new Date(current.getTime() - 7 * 24 * 60 * 60 * 1000);
    fetchMealsRange(weekAgo, current)
      .then((weekMeals) => {
        const days = new Set(
          weekMeals.map((m) => localDateString(new Date(m.eatenAt))),
        );
        setStreak(days.size);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    fetchJson<Goals>("/api/goals").then(setGoals).catch(() => {});
  }, [load]);

  const totals = (meals ?? []).reduce(
    (acc, meal) => {
      const t = mealTotals(meal);
      return {
        calories: acc.calories + t.calories,
        protein: acc.protein + t.protein,
        carbs: acc.carbs + t.carbs,
        fat: acc.fat + t.fat,
      };
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {now ? greetingFor(now.getHours()) : "Today"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {now
              ? now.toLocaleDateString([], {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : " "}
          </p>
        </div>
        {streak !== null && streak > 0 ? (
          <Badge variant="secondary" className="gap-1">
            <Flame data-icon="inline-start" />
            {streak}/7 days
          </Badge>
        ) : null}
      </div>

      {meals === null || !goals ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="mx-auto size-52 rounded-full" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4">
              <ProgressRing
                value={totals.calories}
                max={goals.daily_calories}
                label={
                  remaining >= 0
                    ? remaining.toLocaleString()
                    : Math.abs(remaining).toLocaleString()
                }
                sublabel={remaining >= 0 ? "kcal left" : "kcal over"}
                caption={`${totals.calories.toLocaleString()} of ${goals.daily_calories.toLocaleString()} eaten`}
              />

              <div className="flex flex-col gap-3">
                {macros.map(({ label, value, max }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-16 text-sm font-medium">{label}</span>
                    <div className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${macroColors[label]}`}
                        style={{
                          width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-muted-foreground w-20 text-right text-xs tabular-nums">
                      {Math.round(value)} / {max}g
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {meals.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Plus />
                </EmptyMedia>
                <EmptyTitle>Nothing logged yet</EmptyTitle>
                <EmptyDescription>
                  Snap a photo of your next meal to get started.
                </EmptyDescription>
              </EmptyHeader>
              <Button render={<Link href="/add" />}>Log a meal</Button>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              <h2 className="text-muted-foreground mt-1 text-sm font-medium">
                Meals
              </h2>
              {meals.map((meal) => (
                <MealListItem
                  key={meal.id}
                  meal={meal}
                  onClick={() => setSelected(meal)}
                />
              ))}
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
