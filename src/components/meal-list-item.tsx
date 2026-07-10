"use client";

import Image from "next/image";
import { Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { mealTotals, type ApiMeal } from "@/lib/client";

// A time-of-day glyph on a pastel color block, so a list of photo-less meals
// reads at a glance (breakfast/lunch/dinner/night) and carries Figma's color.
function mealGlyph(hour: number) {
  if (hour < 11) return { Icon: Sunrise, block: "bg-block-cream" }; // morning
  if (hour < 16) return { Icon: Sun, block: "bg-block-lime" }; // midday
  if (hour < 21) return { Icon: Sunset, block: "bg-block-coral" }; // evening
  return { Icon: Moon, block: "bg-block-lilac" }; // night
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
  const { Icon: TimeIcon, block } = mealGlyph(eaten.getHours());

  return (
    <article
      className="editorial-card editorial-cut cursor-pointer transition-all active:translate-y-px active:bg-accent/40"
      onClick={onClick}
    >
      <div className="flex items-stretch gap-3 p-3">
        {meal.photos.length > 0 ? (
          <div className="size-16 shrink-0 overflow-hidden rounded-2xl">
            <Image
              src={meal.photos[0].url}
              alt=""
              width={80}
              height={80}
              unoptimized
              className="size-full object-cover"
            />
          </div>
        ) : (
          <span
            className={`flex size-16 shrink-0 items-center justify-center rounded-2xl text-black ${block}`}
          >
            <TimeIcon className="size-7" strokeWidth={2} />
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
