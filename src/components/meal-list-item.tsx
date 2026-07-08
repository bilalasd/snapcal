"use client";

import Image from "next/image";
import { Utensils } from "lucide-react";
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
    <Card
      className="cursor-pointer py-3 transition-all active:scale-[0.99] active:bg-accent/40"
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-3 px-4">
        {meal.photos.length > 0 ? (
          <Image
            src={meal.photos[0].url}
            alt=""
            width={44}
            height={44}
            unoptimized
            className="size-11 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
            <Utensils className="size-5" />
          </span>
        )}
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
