"use client";

import Image from "next/image";
import { Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { mealTotals, type ApiMeal } from "@/lib/client";

// A time-of-day glyph + tint so a list of photo-less meals isn't a wall of
// identical icons — breakfast/lunch/dinner/night read at a glance.
function mealGlyph(hour: number) {
  if (hour < 11) return { Icon: Sunrise, tint: "text-chart-4" }; // morning
  if (hour < 16) return { Icon: Sun, tint: "text-primary-strong" }; // midday
  if (hour < 21) return { Icon: Sunset, tint: "text-chart-4" }; // evening
  return { Icon: Moon, tint: "text-chart-2" }; // night
}

interface MealListItemProps {
  meal: ApiMeal;
  onClick?: () => void;
  action?: React.ReactNode;
}

export function MealListItem({ meal, onClick, action }: MealListItemProps) {
  const totals = mealTotals(meal);
  const eaten = new Date(meal.eatenAt);
  const time = eaten.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const { Icon: TimeIcon, tint } = mealGlyph(eaten.getHours());

  return (
    <article
      className="editorial-card editorial-cut cursor-pointer transition-all active:translate-y-px active:bg-accent/40"
      onClick={onClick}
    >
      <div className="flex items-stretch gap-3 p-3">
        {meal.photos.length > 0 ? (
          <div className="photo-frame h-20 w-16 shrink-0 -rotate-1">
            <Image
              src={meal.photos[0].url}
              alt=""
              width={80}
              height={104}
              unoptimized
              className="size-full object-cover"
            />
          </div>
        ) : (
          <span
            className={`flex h-20 w-16 shrink-0 items-center justify-center bg-muted ring-1 ring-foreground/15 ${tint}`}
          >
            <TimeIcon className="size-6" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
          <div>
            <p className="editorial-kicker">{time}</p>
            <p className="truncate text-lg font-black tracking-[-0.04em]">
              {meal.name}
            </p>
          </div>
          <p className="text-muted-foreground text-xs font-semibold">
            P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · F{" "}
            {Math.round(totals.fat)}g
          </p>
        </div>
        <span className="flex min-w-16 flex-col items-end justify-center border-l border-foreground/15 pl-3 text-right text-2xl font-black tabular-nums tracking-[-0.06em]">
          {totals.calories}
          <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            kcal
          </span>
        </span>
        {action}
      </div>
    </article>
  );
}
