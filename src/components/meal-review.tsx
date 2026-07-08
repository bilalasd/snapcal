"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";
import type { DraftItem } from "@/lib/client";

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

const scaleOpt = (v: number | null | undefined, factor: number) =>
  v == null ? v : round1(v * factor);

export function scaleDraftItem(item: DraftItem, factor: number): DraftItem {
  return {
    ...item,
    calories: Math.round(item.calories * factor),
    protein_g: round1(item.protein_g * factor),
    carbs_g: round1(item.carbs_g * factor),
    fat_g: round1(item.fat_g * factor),
    sat_fat_g: scaleOpt(item.sat_fat_g, factor),
    fiber_g: scaleOpt(item.fiber_g, factor),
    sugar_g: scaleOpt(item.sugar_g, factor),
    sodium_mg: scaleOpt(item.sodium_mg, factor),
  };
}

interface MealReviewProps {
  name: string;
  onNameChange: (name: string) => void;
  items: DraftItem[];
  onItemsChange: (items: DraftItem[]) => void;
}

const macroFields = [
  { key: "calories", label: "kcal", step: 1 },
  { key: "protein_g", label: "P (g)", step: 0.5 },
  { key: "carbs_g", label: "C (g)", step: 0.5 },
  { key: "fat_g", label: "F (g)", step: 0.5 },
] as const;

export function MealReview({
  name,
  onNameChange,
  items,
  onItemsChange,
}: MealReviewProps) {
  function updateItem(index: number, patch: Partial<DraftItem>) {
    onItemsChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  const totals = items.reduce(
    (acc, i) => ({
      calories: acc.calories + (i.calories || 0),
      protein: round1(acc.protein + (i.protein_g || 0)),
      carbs: round1(acc.carbs + (i.carbs_g || 0)),
      fat: round1(acc.fat + (i.fat_g || 0)),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Input
            aria-label="Meal name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="text-base font-semibold"
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.map((item, index) => (
          <div key={index} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Food name"
                value={item.name}
                onChange={(e) => updateItem(index, { name: e.target.value })}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${item.name}`}
                onClick={() =>
                  onItemsChange(items.filter((_, i) => i !== index))
                }
              >
                <Trash2 />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                aria-label="Portion"
                value={item.portion}
                onChange={(e) => updateItem(index, { portion: e.target.value })}
                className="flex-1 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onItemsChange(
                    items.map((it, i) =>
                      i === index ? scaleDraftItem(it, 0.5) : it,
                    ),
                  )
                }
              >
                ×½
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onItemsChange(
                    items.map((it, i) =>
                      i === index ? scaleDraftItem(it, 2) : it,
                    ),
                  )
                }
              >
                ×2
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {macroFields.map(({ key, label, step }) => (
                <div key={key} className="flex flex-col gap-1">
                  <Label className="text-muted-foreground text-xs">
                    {label}
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={step}
                    min={0}
                    value={item[key]}
                    onChange={(e) =>
                      updateItem(index, {
                        [key]:
                          key === "calories"
                            ? Math.max(0, Math.round(Number(e.target.value)))
                            : Math.max(0, Number(e.target.value)),
                      })
                    }
                  />
                </div>
              ))}
            </div>
            {index < items.length - 1 ? <Separator /> : null}
          </div>
        ))}

        <Button
          variant="outline"
          onClick={() =>
            onItemsChange([
              ...items,
              {
                name: "",
                portion: "",
                calories: 0,
                protein_g: 0,
                carbs_g: 0,
                fat_g: 0,
              },
            ])
          }
        >
          <Plus data-icon="inline-start" />
          Add item
        </Button>

        <Separator />
        <div className="text-sm">
          <span className="font-semibold">{totals.calories} kcal</span>
          <span className="text-muted-foreground">
            {" "}
            · P {totals.protein}g · C {totals.carbs}g · F {totals.fat}g
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
