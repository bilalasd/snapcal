"use client";

import type { DraftItem } from "@/lib/client";

interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  satFat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
}

function sumField(
  items: DraftItem[],
  key: "sat_fat_g" | "fiber_g" | "sugar_g" | "sodium_mg",
): number | null {
  // If no item has the value, show a dash rather than a misleading 0
  const present = items.some((i) => i[key] != null);
  if (!present) return null;
  return items.reduce((sum, i) => sum + (i[key] ?? 0), 0);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** FDA-style Nutrition Facts panel for the whole meal. */
export function NutritionFacts({ items }: { items: DraftItem[] }) {
  const t: Totals = {
    calories: items.reduce((s, i) => s + (i.calories || 0), 0),
    protein: round1(items.reduce((s, i) => s + (i.protein_g || 0), 0)),
    carbs: round1(items.reduce((s, i) => s + (i.carbs_g || 0), 0)),
    fat: round1(items.reduce((s, i) => s + (i.fat_g || 0), 0)),
    satFat: sumField(items, "sat_fat_g"),
    fiber: sumField(items, "fiber_g"),
    sugar: sumField(items, "sugar_g"),
    sodium: sumField(items, "sodium_mg"),
  };

  const fmt = (n: number | null, unit: string) =>
    n === null ? "—" : `${round1(n)}${unit}`;

  return (
    <div className="rounded-lg border-2 border-foreground bg-card p-3 font-sans text-foreground">
      <p className="text-xl font-extrabold leading-none">Nutrition Facts</p>
      <p className="text-muted-foreground text-xs">Whole meal</p>
      <div className="my-1 h-1 bg-foreground" />
      <div className="flex items-end justify-between border-b-4 border-foreground pb-1">
        <span className="font-bold">Calories</span>
        <span className="text-2xl font-extrabold tabular-nums">
          {t.calories}
        </span>
      </div>

      <Row label="Total Fat" value={fmt(t.fat, "g")} bold />
      <Row label="Saturated Fat" value={fmt(t.satFat, "g")} indent />
      <Row label="Sodium" value={fmt(t.sodium, "mg")} bold />
      <Row label="Total Carbohydrate" value={fmt(t.carbs, "g")} bold />
      <Row label="Dietary Fiber" value={fmt(t.fiber, "g")} indent />
      <Row label="Total Sugars" value={fmt(t.sugar, "g")} indent />
      <div className="h-1 bg-foreground" />
      <Row label="Protein" value={fmt(t.protein, "g")} bold />

      {(t.satFat === null ||
        t.fiber === null ||
        t.sugar === null ||
        t.sodium === null) && (
        <p className="text-muted-foreground mt-2 text-[10px]">
          — = not estimated. Values are AI estimates, not lab-measured.
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  indent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-b border-border py-1 text-sm ${
        indent ? "pl-4" : ""
      }`}
    >
      <span className={bold ? "font-bold" : ""}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
