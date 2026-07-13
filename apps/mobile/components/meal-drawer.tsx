import { useState } from "react";
import { View, Text, ScrollView, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { itemsToDraft, localDateString, type ApiMeal, type DraftItem } from "@mealio/shared";
import { fetchJson } from "../lib/api";
import { tapSuccess } from "../lib/haptics";
import { stashDraft } from "../lib/draft";
import { Sheet } from "./sheet";
import { Button, Field, Input, Spinner } from "./ui";
import { MealReview } from "./meal-review";
import { NutritionFacts } from "./nutrition-facts";

export function MealDrawer({
  meal,
  onClose,
  onChanged,
}: {
  meal: ApiMeal | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Sheet open={!!meal} onClose={onClose}>
      {meal ? <MealDrawerInner key={meal.id} meal={meal} onClose={onClose} onChanged={onChanged} /> : null}
    </Sheet>
  );
}

function MealDrawerInner({ meal, onClose, onChanged }: { meal: ApiMeal; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(meal.name);
  const [items, setItems] = useState<DraftItem[]>(() => itemsToDraft(meal));
  const [favorite, setFavorite] = useState(meal.isFavorite);
  const [dateStr, setDateStr] = useState(() => localDateString(new Date(meal.eatenAt)));
  const [busy, setBusy] = useState(false);

  async function saveChanges() {
    const valid = items.filter((i) => i.name.trim());
    if (valid.length === 0) return Alert.alert("A meal needs at least one item");
    const orig = new Date(meal.eatenAt);
    const [y, m, d] = dateStr.split("-").map(Number);
    const eaten = new Date(orig);
    eaten.setFullYear(y, m - 1, d);
    setBusy(true);
    try {
      await fetchJson(`/api/meals/${meal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, is_favorite: favorite, eaten_at: eaten.toISOString(), items: valid }),
      });
      tapSuccess();
      onChanged();
      onClose();
    } catch (err) {
      Alert.alert(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete meal?", meal.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await fetchJson(`/api/meals/${meal.id}`, { method: "DELETE" });
            onChanged();
            onClose();
          } catch (err) {
            Alert.alert(err instanceof Error ? err.message : "Delete failed");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function logAgain() {
    stashDraft({
      name: meal.name,
      eaten_at: new Date().toISOString(),
      source: "copy",
      items: itemsToDraft(meal),
      photos: meal.photos.map((p) => ({ url: p.url, pathname: p.pathname })),
    });
    onClose();
    router.push("/add");
  }

  return (
    <View className="px-4">
      <Text className="mb-3 text-center text-xl font-black tracking-tight text-foreground">Edit meal</Text>
      <ScrollView className="max-h-[60vh]" contentContainerClassName="gap-4">
        {meal.photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {meal.photos.map((p) => (
              <Image key={p.id} source={{ uri: p.url }} className="h-40 w-40 rounded-2xl" />
            ))}
          </ScrollView>
        ) : null}
        <MealReview name={name} onNameChange={setName} items={items} onItemsChange={setItems} />
        <Field label="Date">
          <Input value={dateStr} onChangeText={setDateStr} placeholder="YYYY-MM-DD" />
        </Field>
        <NutritionFacts items={items} />
      </ScrollView>

      <View className="mt-4 gap-2">
        <View className="flex-row gap-2">
          <Button variant={favorite ? "default" : "outline"} className="flex-1" onPress={() => setFavorite(!favorite)} disabled={busy}>
            <Feather name="star" size={16} color={favorite ? "#fff" : "#000"} />
            <Text className={`font-bold ${favorite ? "text-white" : "text-foreground"}`}>{favorite ? "Favorited" : "Favorite"}</Text>
          </Button>
          <Button variant="outline" className="flex-1" onPress={logAgain} disabled={busy}>
            <Feather name="copy" size={16} color="#000" />
            <Text className="font-bold text-foreground">Log again</Text>
          </Button>
          <Button variant="outline" size="icon" onPress={confirmDelete} disabled={busy}>
            <Feather name="trash-2" size={18} color="#000" />
          </Button>
        </View>
        <Button onPress={saveChanges} disabled={busy}>
          {busy ? <Spinner /> : <Text className="text-base font-bold text-white">Save changes</Text>}
        </Button>
      </View>
    </View>
  );
}
