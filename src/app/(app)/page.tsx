"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
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

export default function TodayPage() {
  const [meals, setMeals] = useState<ApiMeal[] | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [selected, setSelected] = useState<ApiMeal | null>(null);

  const load = useCallback(() => {
    fetchMealsForDate(localDateString()).then(setMeals).catch(() => setMeals([]));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    fetchMealsRange(weekAgo, new Date())
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Today</h1>
        {streak !== null ? (
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <Flame className="size-4" />
            logged {streak} of last 7 days
          </span>
        ) : null}
      </div>

      {meals === null || !goals ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="mx-auto size-52 rounded-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <ProgressRing
            value={totals.calories}
            max={goals.daily_calories}
            label={String(totals.calories)}
            sublabel={`of ${goals.daily_calories} kcal`}
          />

          <Card>
            <CardContent className="flex flex-col gap-3">
              {macros.map(({ label, value, max }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-16 text-sm">{label}</span>
                  <Progress
                    value={max > 0 ? Math.min((value / max) * 100, 100) : 0}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground w-20 text-right text-xs tabular-nums">
                    {Math.round(value)} / {max}g
                  </span>
                </div>
              ))}
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
