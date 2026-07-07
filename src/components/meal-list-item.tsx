"use client";

import { Card, CardContent } from "@/components/ui/card";
import { mealTotals, type ApiMeal } from "@/lib/client";

interface MealListItemProps {
  meal: ApiMeal;
  onClick?: () => void;
  action?: React.ReactNode;
}

export function MealListItem({ meal, onClick, action }: MealListItemProps) {
  const totals = mealTotals(meal);
  const time = new Date(meal.eatenAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card className="py-3" onClick={onClick}>
      <CardContent className="flex items-center gap-3 px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{meal.name}</p>
          <p className="text-muted-foreground text-xs">
            {time} · P {Math.round(totals.protein)}g · C{" "}
            {Math.round(totals.carbs)}g · F {Math.round(totals.fat)}g
          </p>
        </div>
        <span className="font-semibold tabular-nums">
          {totals.calories}
          <span className="text-muted-foreground text-xs font-normal"> kcal</span>
        </span>
        {action}
      </CardContent>
    </Card>
  );
}
