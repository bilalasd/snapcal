import { Alert } from "react-native";
import { itemsToDraft, type ApiMeal } from "@loggi/shared";
import { fetchJson } from "./api";
import { applyMealDelete, restoreMeal, settleMeal } from "./cache";
import { stashDraft } from "./draft";
import { showToast } from "../components/toast";

// Optimistic delete with a grace period — shared by the meal drawer and the
// list quick menu. The meal leaves every list immediately, but the DELETE
// only goes out once the undo toast expires: the server deletes photo blobs
// with the row, so a fired DELETE can't be walked back.
export function deleteMeal(meal: ApiMeal, onChanged: () => void) {
  applyMealDelete(meal.id);
  onChanged();
  showToast(`Deleted ${meal.name}`, {
    actionLabel: "Undo",
    onAction: () => {
      restoreMeal(meal);
      onChanged();
    },
    onExpire: () => {
      fetchJson(`/api/meals/${meal.id}`, { method: "DELETE" })
        .then(() => settleMeal(meal.id))
        .catch((err) => {
          settleMeal(meal.id);
          Alert.alert("Delete failed — the meal is still there", err instanceof Error ? err.message : undefined);
          onChanged();
        });
    },
  });
}

// Stage a copy of the meal as today's draft; caller routes to /add.
export function stashLogAgain(meal: ApiMeal) {
  stashDraft({
    name: meal.name,
    eaten_at: new Date().toISOString(),
    source: "copy",
    items: itemsToDraft(meal),
    photos: meal.photos.map((p) => ({ url: p.url, pathname: p.pathname })),
  });
}
