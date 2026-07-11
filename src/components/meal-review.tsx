"use client";

import { useState } from "react";
import { BadgeCheck, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { scalePortion } from "@/lib/analysis";
import type { DraftItem } from "@/lib/client";

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

const scaleOpt = (v: number | null | undefined, factor: number) =>
  v == null ? v : round1(v * factor);

export function scaleDraftItem(item: DraftItem, factor: number): DraftItem {
  return {
    ...item,
    portion: scalePortion(item.portion, factor),
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
  { key: "calories", label: "cal", step: 1 },
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
  // Accordion: one item's editor open at a time. Items read as a tidy summary
  // list by default; tap a row to reveal the number fields (progressive
  // disclosure) so a 4-item meal isn't a wall of inputs.
  const [open, setOpen] = useState<number | null>(null);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    onItemsChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function scale(index: number, factor: number) {
    onItemsChange(
      items.map((it, i) => (i === index ? scaleDraftItem(it, factor) : it)),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {/* Wraps to fit long names, centered, no border box. */}
          <Textarea
            aria-label="Meal name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            rows={1}
            className="min-h-0 resize-none border-0 bg-transparent p-0 text-center text-base font-semibold shadow-none [field-sizing:content] focus-visible:ring-0"
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {items.map((item, index) => {
          const isOpen = open === index;
          return (
            <div
              key={index}
              className="border-b border-foreground/10 last:border-0"
            >
              {/* Summary row — tap to edit */}
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-semibold">
                    {item.name || "Untitled item"}
                    {item.usda_match ? (
                      <BadgeCheck className="text-primary-strong size-3.5 shrink-0" />
                    ) : null}
                  </p>
                  {item.portion ? (
                    <p className="text-muted-foreground text-xs">{item.portion}</p>
                  ) : null}
                  <p className="text-muted-foreground text-xs tabular-nums">
                    P {round1(item.protein_g)} · C {round1(item.carbs_g)} · F{" "}
                    {round1(item.fat_g)}
                  </p>
                </div>
                <span className="tabular-nums font-bold">
                  {item.calories}
                  <span className="text-muted-foreground ml-1 text-xs font-medium">
                    cal
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "text-muted-foreground size-4 shrink-0 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {/* Editor — revealed on demand */}
              {isOpen ? (
                <div className="flex flex-col gap-2 pb-3">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Food name"
                      value={item.name}
                      onChange={(e) =>
                        updateItem(index, { name: e.target.value })
                      }
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
                  {item.usda_match ? (
                    <Badge variant="secondary" className="w-fit gap-1">
                      <BadgeCheck data-icon="inline-start" />
                      USDA verified · {item.usda_match}
                    </Badge>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Portion"
                      value={item.portion}
                      onChange={(e) =>
                        updateItem(index, { portion: e.target.value })
                      }
                      className="flex-1 text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Halve portion"
                      title="Halve portion"
                      onClick={() => scale(index, 0.5)}
                    >
                      ×½
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Double portion"
                      title="Double portion"
                      onClick={() => scale(index, 2)}
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
                </div>
              ) : null}
            </div>
          );
        })}

        <Button
          variant="outline"
          className="mt-3"
          onClick={() => {
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
            ]);
            setOpen(items.length); // open the new item for entry
          }}
        >
          <Plus data-icon="inline-start" />
          Add item
        </Button>
      </CardContent>
    </Card>
  );
}
