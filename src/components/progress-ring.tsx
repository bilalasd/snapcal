"use client";

import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number;
  max: number;
  label: string;
  sublabel: string;
  caption?: string;
}

export function ProgressRing({
  value,
  max,
  label,
  sublabel,
  caption,
}: ProgressRingProps) {
  const radius = 84;
  const stroke = 16;
  const circumference = 2 * Math.PI * radius;
  const fraction = max > 0 ? Math.min(value / max, 1) : 0;
  const over = max > 0 && value > max;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative size-52">
        <svg viewBox="0 0 200 200" className="size-full -rotate-90">
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted"
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            className={cn(
              "transition-[stroke-dashoffset] duration-700 ease-out",
              over ? "stroke-destructive" : "stroke-primary",
            )}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "text-4xl font-bold tabular-nums tracking-tight",
              over && "text-destructive",
            )}
          >
            {label}
          </span>
          <span className="text-muted-foreground text-sm">{sublabel}</span>
        </div>
      </div>
      {caption ? (
        <p className="text-muted-foreground text-xs">{caption}</p>
      ) : null}
    </div>
  );
}
