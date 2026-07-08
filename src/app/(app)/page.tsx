"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Flame, Plus } from "lucide-react";
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
import { useSwipe } from "@/lib/use-swipe";
import { cn } from "@/lib/utils";
import {
  fetchJson,
  fetchMealsForDate,
  fetchMealsRange,
  localDateString,
  MACRO_BG,
  mealTotals,
  type ApiMeal,
  type Goals,
} from "@/lib/client";

const MACRO_BG_BY_LABEL: Record<string, string> = {
  Protein: MACRO_BG.protein,
  Carbs: MACRO_BG.carbs,
  Fat: MACRO_BG.fat,
};

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
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function TodayPage() {
  const router = useRouter();
  const [today] = useState(() => localDateString());
  const [date, setDate] = useState(today);
  const [meals, setMeals] = useState<ApiMeal[] | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [selected, setSelected] = useState<ApiMeal | null>(null);

  const isToday = date === today;

  const load = useCallback((forDate: string) => {
    setMeals(null);
    fetchMealsForDate(forDate)
      .then(setMeals)
      .catch(() => setMeals([]));
  }, []);

  useEffect(() => {
    load(date);
  }, [load, date]);

  useEffect(() => {
    fetchJson<Goals>("/api/goals")
      .then((g) => {
        if (!g.onboarded) {
          router.replace("/onboarding");
          return;
        }
        setGoals(g);
      })
      .catch(() => {});
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    fetchMealsRange(weekAgo, new Date())
      .then((weekMeals) => {
        const days = new Set(
          weekMeals.map((m) => localDateString(new Date(m.eatenAt))),
        );
        setStreak(days.size);
      })
      .catch(() => {});
  }, [router]);

  function goPrev() {
    setDate((d) => addDays(d, -1));
  }
  function goNext() {
    setDate((d) => (d < today ? addDays(d, 1) : d));
  }
  const swipe = useSwipe(goNext, goPrev);

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
  const now = new Date();

  return (
    <div className="flex flex-col gap-4" {...swipe}>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isToday ? greetingFor(now.getHours()) : dayHeading(date, today)}
          </h1>
          <p className="text-muted-foreground text-sm">
            {new Date(`${date}T12:00:00`).toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        {isToday && streak !== null && streak > 0 ? (
          <Badge variant="secondary" className="gap-1">
            <Flame data-icon="inline-start" />
            {streak}/7 days
          </Badge>
        ) : null}
      </div>

      {/* Day navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          aria-label="Previous day"
        >
          <ChevronLeft />
        </Button>
        <span className="text-muted-foreground text-sm">
          {isToday ? "Swipe to see past days" : dayHeading(date, today)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={goNext}
          disabled={isToday}
          aria-label="Next day"
        >
          <ChevronRight />
        </Button>
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
                        className={cn(
                          "h-full rounded-full transition-[width] duration-500",
                          MACRO_BG_BY_LABEL[label],
                        )}
                        style={{
                          width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-muted-foreground w-24 text-right text-xs tabular-nums">
                      {Math.round(value)}/{max}g ·{" "}
                      {max > 0 ? Math.round((value / max) * 100) : 0}%
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
                <EmptyTitle>
                  {isToday ? "Nothing logged yet" : "No meals this day"}
                </EmptyTitle>
                <EmptyDescription>
                  {isToday
                    ? "Snap a photo of your next meal to get started."
                    : "Add a meal to log it for this day."}
                </EmptyDescription>
              </EmptyHeader>
              <Button
                render={
                  <Link href={isToday ? "/add" : `/add?date=${date}`} />
                }
              >
                Log a meal
              </Button>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-muted-foreground text-sm font-medium">
                  Meals
                </h2>
                {!isToday ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    render={<Link href={`/add?date=${date}`} />}
                  >
                    <Plus data-icon="inline-start" />
                    Add to this day
                  </Button>
                ) : null}
              </div>
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
        onChanged={() => load(date)}
      />
    </div>
  );
}
