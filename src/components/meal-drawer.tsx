"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MealReview } from "@/components/meal-review";
import { NutritionFacts } from "@/components/nutrition-facts";
import { PhotoStrip } from "@/components/photo-strip";
import {
  fetchJson,
  itemsToDraft,
  stashDraft,
  type ApiMeal,
  type DraftItem,
} from "@/lib/client";

interface MealDrawerProps {
  meal: ApiMeal | null;
  onClose: () => void;
  onChanged: () => void;
}

export function MealDrawer({ meal, onClose, onChanged }: MealDrawerProps) {
  if (!meal) return null;
  // Keyed by meal id so switching meals resets the edit state cleanly.
  return (
    <MealDrawerInner
      key={meal.id}
      meal={meal}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

function MealDrawerInner({
  meal,
  onClose,
  onChanged,
}: MealDrawerProps & { meal: ApiMeal }) {
  const router = useRouter();
  const [name, setName] = useState(meal.name);
  const [items, setItems] = useState<DraftItem[]>(() => itemsToDraft(meal));
  const [favorite, setFavorite] = useState(meal.isFavorite);
  // Local YYYY-MM-DD of the meal, for the date editor
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date(meal.eatenAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [busy, setBusy] = useState(false);

  async function saveChanges() {
    const valid = items.filter((i) => i.name.trim());
    if (valid.length === 0) {
      toast.error("A meal needs at least one item");
      return;
    }
    // Preserve time-of-day, change only the calendar date
    const orig = new Date(meal.eatenAt);
    const [y, m, d] = dateStr.split("-").map(Number);
    const eaten = new Date(orig);
    eaten.setFullYear(y, m - 1, d);
    setBusy(true);
    try {
      await fetchJson(`/api/meals/${meal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          is_favorite: favorite,
          eaten_at: eaten.toISOString(),
          items: valid,
        }),
      });
      toast.success("Updated");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMeal() {
    setBusy(true);
    try {
      await fetchJson(`/api/meals/${meal.id}`, { method: "DELETE" });
      // Undo re-creates the meal from its data (it comes back with a new id,
      // which is fine — the point is not losing the entry to a mis-tap).
      toast.success("Deleted", {
        action: {
          label: "Undo",
          onClick: () =>
            fetchJson("/api/meals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: meal.name || "Meal",
                eaten_at: meal.eatenAt,
                note: meal.note || undefined,
                source: "copy",
                items: itemsToDraft(meal).filter((i) => i.name.trim()),
                photos: meal.photos.map((p) => ({
                  url: p.url,
                  pathname: p.pathname,
                })),
              }),
            })
              .then(() => {
                toast.success("Restored");
                onChanged();
              })
              .catch(() => toast.error("Couldn't undo")),
        },
      });
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function logAgain() {

    stashDraft({
      name: meal.name,
      eaten_at: new Date().toISOString(),
      source: "copy",
      items: itemsToDraft(meal),
      photos: meal.photos.map((p) => ({ url: p.url, pathname: p.pathname })),
    });
    router.push("/add");
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit meal</DrawerTitle>
        </DrawerHeader>
        <div className="flex max-h-[60dvh] flex-col gap-4 overflow-y-auto px-4">
          {meal.photos.length > 0 ? (
            <PhotoStrip urls={meal.photos.map((p) => p.url)} />
          ) : null}
          <MealReview
            name={name}
            onNameChange={setName}
            items={items}
            onItemsChange={setItems}
          />
          <Field>
            <FieldLabel htmlFor="meal-date">Date</FieldLabel>
            <Input
              id="meal-date"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </Field>
          <NutritionFacts items={items} />
        </div>
        <DrawerFooter>
          <div className="flex gap-2">
            <Button
              variant={favorite ? "default" : "outline"}
              className="flex-1"
              onClick={() => setFavorite(!favorite)}
              disabled={busy}
            >
              <Star data-icon="inline-start" />
              {favorite ? "Favorited" : "Favorite"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={logAgain}
              disabled={busy}
            >
              <Copy data-icon="inline-start" />
              Log again
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Delete meal"
              onClick={deleteMeal}
              disabled={busy}
            >
              <Trash2 />
            </Button>
          </div>
          <Button onClick={saveChanges} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Save changes
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
