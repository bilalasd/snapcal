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
import { Spinner } from "@/components/ui/spinner";
import { MealReview } from "@/components/meal-review";
import {
  fetchJson,
  stashDraft,
  type ApiMeal,
  type DraftItem,
} from "@/lib/client";

interface MealDrawerProps {
  meal: ApiMeal | null;
  onClose: () => void;
  onChanged: () => void;
}

function toDraftItems(meal: ApiMeal): DraftItem[] {
  return meal.items.map((item) => ({
    name: item.name,
    portion: item.portion,
    calories: item.calories,
    protein_g: Number(item.proteinG),
    carbs_g: Number(item.carbsG),
    fat_g: Number(item.fatG),
  }));
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
  const [items, setItems] = useState<DraftItem[]>(() => toDraftItems(meal));
  const [favorite, setFavorite] = useState(meal.isFavorite);
  const [busy, setBusy] = useState(false);

  async function saveChanges() {

    const valid = items.filter((i) => i.name.trim());
    if (valid.length === 0) {
      toast.error("A meal needs at least one item");
      return;
    }
    setBusy(true);
    try {
      await fetchJson(`/api/meals/${meal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          is_favorite: favorite,
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
      toast.success("Deleted");
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
      items: toDraftItems(meal),
    });
    router.push("/add");
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit meal</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[55dvh] overflow-y-auto px-4">
          <MealReview
            name={name}
            onNameChange={setName}
            items={items}
            onItemsChange={setItems}
          />
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
