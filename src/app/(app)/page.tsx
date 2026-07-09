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

  const load = useCallback((forDate: string, showLoading = true) => {
    if (showLoading) setMeals(null);
    fetchMealsForDate(forDate)
      .then(setMeals)
      .catch(() => setMeals([]));
  }, []);

  useEffect(() => {
    // Reset to a loading skeleton whenever the viewed day changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const headline = isToday
    ? greetingFor(now.getHours())
    : dayHeading(date, today);
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-5" {...swipe}>
      <section className="snap-in flex items-start justify-between gap-4">
        <div>
          <p className="editorial-kicker">{dateLabel}</p>
          <h1 className="editorial-headline mt-1 max-w-64">{headline}</h1>
        </div>
        {isToday && streak !== null && streak > 0 ? (
          <Badge variant="secondary" className="gap-1 rounded-sm">
            <Flame data-icon="inline-start" />
            {streak}/7 days
          </Badge>
        ) : null}
      </section>

      {/* Day navigation */}
      <div className="editorial-rule flex items-center justify-between pt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          aria-label="Previous day"
        >
          <ChevronLeft />
        </Button>
        <span className="text-muted-foreground text-xs font-extrabold uppercase tracking-[0.16em]">
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
          <Card className="editorial-card editorial-cut">
            <CardContent className="grid grid-cols-[1fr_auto] gap-4 px-4">
              <div className="flex flex-col justify-between">
                <div>
                  <p className="editorial-kicker">
                    {remaining >= 0 ? "Still available" : "Over target"}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-6xl font-black tracking-[-0.09em] tabular-nums",
                      remaining < 0 && "text-destructive",
                    )}
                  >
                    {Math.abs(remaining).toLocaleString()}
                  </p>
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    kcal {remaining >= 0 ? "left" : "over"}
                  </p>
                </div>
                <p className="mt-4 text-xs font-semibold text-muted-foreground">
                  {totals.calories.toLocaleString()} of{" "}
                  {goals.daily_calories.toLocaleString()} eaten
                </p>
              </div>
              <ProgressRing
                value={totals.calories}
                max={goals.daily_calories}
                label={`${Math.min(
                  Math.round((totals.calories / goals.daily_calories) * 100),
                  999,
                )}%`}
                sublabel="logged"
                size="compact"
              />

              <div className="col-span-2 flex flex-col gap-3 border-t border-foreground/15 pt-4">
                {macros.map(({ label, value, max }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-16 text-xs font-extrabold uppercase tracking-[0.14em]">
                      {label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-none bg-muted">
                      <div
                        className={cn(
                          "h-full transition-[width] duration-500",
                          MACRO_BG_BY_LABEL[label],
                        )}
                        style={{
                          width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-24 text-right text-xs font-bold tabular-nums text-muted-foreground">
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
            <div className="flex flex-col gap-3">
              <div className="editorial-rule flex items-center justify-between pt-3">
                <h2 className="editorial-kicker">
                  Meal journal
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
        onChanged={() => load(date, false)}
      />
    </div>
  );
}
