"use client";

import { useEffect, useState } from "react";
import { Database, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { fetchJson, type DraftItem } from "@/lib/client";
import { foodToItem } from "@/lib/usda";

interface FoodResult {
  id: string;
  description: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  satFatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

interface FoodSearchDrawerProps {
  onAdd: (item: DraftItem) => void;
}

export function FoodSearchDrawer({ onAdd }: FoodSearchDrawerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<FoodResult | null>(null);
  const [grams, setGrams] = useState("100");

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      fetchJson<FoodResult[]>(`/api/foods?q=${encodeURIComponent(q)}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  function reset() {
    setPicked(null);
    setGrams("100");
    setQuery("");
    setResults([]);
  }

  function add() {
    if (!picked) return;
    const g = Number(grams);
    if (!g || g <= 0) return;
    onAdd(foodToItem(picked, g) as DraftItem);
    setOpen(false);
    reset();
  }

  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Database data-icon="inline-start" />
        Add from food database
      </Button>

      <Drawer
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DrawerContent
          // The search view fills a tall sheet; the "how much?" step stays auto.
          style={
            picked
              ? undefined
              : ({ "--drawer-height": "88dvh" } as React.CSSProperties)
          }
        >
          <DrawerHeader>
            <DrawerTitle>
              {picked ? "How much?" : "Search foods"}
            </DrawerTitle>
            <DrawerDescription>
              {picked
                ? "Verified USDA nutrition, scaled to your portion."
                : "Whole ingredients with lab-measured nutrition."}
            </DrawerDescription>
          </DrawerHeader>

          {picked ? (
            <div className="flex flex-col gap-4 px-4 pb-4">
              <p className="font-medium">{picked.description}</p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="fs-grams" className="text-sm font-medium">
                    Amount (grams)
                  </label>
                  <Input
                    id="fs-grams"
                    type="number"
                    inputMode="numeric"
                    autoFocus
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                  />
                </div>
                <div className="flex gap-1">
                  {[50, 100, 150, 200].map((g) => (
                    <Button
                      key={g}
                      variant="outline"
                      size="sm"
                      onClick={() => setGrams(String(g))}
                    >
                      {g}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-muted-foreground text-sm">
                {Math.round((picked.calories * Number(grams || 0)) / 100)} kcal ·
                P {Math.round((picked.proteinG * Number(grams || 0)) / 100)}g · C{" "}
                {Math.round((picked.carbsG * Number(grams || 0)) / 100)}g · F{" "}
                {Math.round((picked.fatG * Number(grams || 0)) / 100)}g
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPicked(null)}
                >
                  Back
                </Button>
                <Button className="flex-1" onClick={add}>
                  Add item
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  autoFocus
                  placeholder="e.g. chicken thigh"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                {loading ? (
                  <div className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
                    <Spinner /> Searching…
                  </div>
                ) : results.length === 0 && query.trim().length >= 2 ? (
                  <p className="text-muted-foreground p-3 text-sm">
                    No foods found. Try a simpler name, or log it with a photo
                    instead.
                  </p>
                ) : (
                  results.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => setPicked(food)}
                      className="hover:bg-accent/50 active:bg-accent flex items-center justify-between rounded-lg p-3 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {food.description}
                      </span>
                      <span className="text-muted-foreground ml-2 shrink-0 text-xs tabular-nums">
                        {Math.round(food.calories)} kcal/100g
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
