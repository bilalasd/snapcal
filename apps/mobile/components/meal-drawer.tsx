import { useState } from "react";
import { View, Text, ScrollView, Alert, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { itemsToDraft, localDateString, type ApiMeal, type DraftItem } from "@loggi/shared";
import { fetchJson } from "../lib/api";
import { useColors } from "../lib/colors";
import { tapSuccess } from "../lib/haptics";
import { deleteMeal, stashLogAgain } from "../lib/meal-actions";
import { applyMealEdit, draftItemsToApi, settleMeal } from "../lib/cache";
import { snapPhoto } from "../lib/image";
import { Sheet } from "./sheet";
import { TimePickerSheet, formatTime } from "./time-picker-sheet";
import { Button, Field, Input, Spinner } from "./ui";
import { Photo } from "./photo";
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
  const colors = useColors();
  const [name, setName] = useState(meal.name);
  const [items, setItems] = useState<DraftItem[]>(() => itemsToDraft(meal));
  const [favorite, setFavorite] = useState(meal.isFavorite);
  const [dateStr, setDateStr] = useState(() => localDateString(new Date(meal.eatenAt)));
  const [time, setTime] = useState(() => {
    const d = new Date(meal.eatenAt);
    return { h: d.getHours(), m: d.getMinutes() };
  });
  const [timeOpen, setTimeOpen] = useState(false);

  // Optimistic: update the caches + close instantly, PATCH in the background.
  function saveChanges() {
    const valid = items.filter((i) => i.name.trim());
    if (valid.length === 0) return Alert.alert("A meal needs at least one item");
    saveWith(valid);
  }

  function saveWith(valid: DraftItem[]) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
    if (!match) return Alert.alert("Date must look like 2026-07-15");
    const [y, m, d] = match.slice(1).map(Number);
    const eaten = new Date(meal.eatenAt);
    eaten.setFullYear(y, m - 1, d);
    // Round-trip check catches out-of-range days like 2026-02-31.
    if (eaten.getMonth() !== m - 1 || eaten.getDate() !== d) return Alert.alert("That date doesn't exist — check the month and day");
    eaten.setHours(time.h, time.m, 0, 0);

    const updated: ApiMeal = {
      ...meal,
      name: name || "Meal",
      isFavorite: favorite,
      eatenAt: eaten.toISOString(),
      items: draftItemsToApi(valid, meal.id),
    };
    applyMealEdit(updated);
    tapSuccess();
    onChanged();
    onClose();

    fetchJson(`/api/meals/${meal.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, is_favorite: favorite, eaten_at: eaten.toISOString(), items: valid }),
    })
      .then(() => settleMeal(meal.id))
      .catch((err) => {
        settleMeal(meal.id);
        Alert.alert("Update didn't save", err instanceof Error ? err.message : "Try again.");
        onChanged(); // refetch restores the server's version
      });
  }

  // No confirm dialog — the delete is instant and the undo toast is the net.
  function removeMeal() {
    onClose();
    deleteMeal(meal, onChanged);
  }

  function logAgain() {
    stashLogAgain(meal);
    onClose();
    router.push("/add");
  }

  // Confirm a pre-logged meal: it was eaten just now. Optimistic like the rest.
  function confirmEaten() {
    const now = new Date().toISOString();
    const updated: ApiMeal = { ...meal, planned: false, eatenAt: now };
    applyMealEdit(updated);
    tapSuccess();
    onChanged();
    onClose();
    fetchJson(`/api/meals/${meal.id}`, {
      method: "PATCH",
      body: JSON.stringify({ planned: false, eaten_at: now }),
    })
      .then(() => settleMeal(meal.id))
      .catch((err) => {
        settleMeal(meal.id);
        Alert.alert("Update didn't save", err instanceof Error ? err.message : "Try again.");
        onChanged();
      });
  }

  // Empty-plate correction: snap the finished plate, scale items by what was
  // actually eaten. Honest numbers over confident numbers (PRODUCT §3.2).
  const [adjusting, setAdjusting] = useState(false);
  async function adjustLeftovers() {
    const valid = items.filter((i) => i.name.trim());
    if (valid.length === 0) return;
    try {
      const snap = await snapPhoto();
      if (!snap) return;
      setAdjusting(true);
      const { fractions } = await fetchJson<{ fractions: number[] }>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({
          images: [snap.encoded],
          leftovers_of: valid.map((i) => ({ name: i.name, portion: i.portion })),
        }),
      });
      setAdjusting(false);
      const scale = (v: number, f: number) => Math.round(v * f * 10) / 10;
      const scaled = valid.map((it, i) => {
        const f = Math.min(Math.max(fractions[i] ?? 1, 0), 1);
        return {
          ...it,
          calories: Math.round(it.calories * f),
          protein_g: scale(it.protein_g, f),
          carbs_g: scale(it.carbs_g, f),
          fat_g: scale(it.fat_g, f),
          sat_fat_g: it.sat_fat_g == null ? it.sat_fat_g : scale(it.sat_fat_g, f),
          fiber_g: it.fiber_g == null ? it.fiber_g : scale(it.fiber_g, f),
          sugar_g: it.sugar_g == null ? it.sugar_g : scale(it.sugar_g, f),
          sodium_mg: it.sodium_mg == null ? it.sodium_mg : Math.round(it.sodium_mg * f),
        };
      });
      const oldTotal = valid.reduce((s, i) => s + i.calories, 0);
      const newTotal = scaled.reduce((s, i) => s + i.calories, 0);
      if (newTotal >= oldTotal) {
        Alert.alert("Clean plate!", "Looks like it's all eaten — nothing to adjust.");
        return;
      }
      Alert.alert(
        "Adjust for leftovers?",
        `Bevi's read: you ate about ${Math.round((newTotal / oldTotal) * 100)}% — ${newTotal.toLocaleString()} cal instead of ${oldTotal.toLocaleString()}. It's still an estimate.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Adjust",
            onPress: () => {
              setItems(scaled);
              saveWith(scaled);
            },
          },
        ],
      );
    } catch (err) {
      setAdjusting(false);
      Alert.alert("That one stumped Bevi", err instanceof Error ? err.message : "Try a clearer photo of the plate.");
    }
  }

  return (
    <View className="px-4">
      <Text className="mb-3 text-center text-xl font-black tracking-tight text-foreground">Edit meal</Text>
      <ScrollView className="max-h-[60vh]" contentContainerClassName="gap-4">
        {meal.photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {meal.photos.map((p) => (
              <Photo key={p.id} source={{ uri: p.url }} className="h-40 w-40 rounded-2xl" />
            ))}
          </ScrollView>
        ) : null}
        <MealReview name={name} onNameChange={setName} items={items} onItemsChange={setItems} />
        <Field label="Date & time">
          <View className="flex-row gap-2">
            <Input value={dateStr} onChangeText={setDateStr} placeholder="YYYY-MM-DD" className="flex-1" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change time"
              onPress={() => setTimeOpen(true)}
              className="min-h-11 flex-row items-center gap-1.5 rounded-2xl border border-border bg-muted px-4 active:opacity-70"
            >
              <Feather name="clock" size={14} color={colors.foreground} />
              <Text className="text-base font-semibold text-foreground">{formatTime(time.h, time.m)}</Text>
            </Pressable>
          </View>
        </Field>
        <NutritionFacts items={items} />
      </ScrollView>

      <View className="mt-4 gap-2">
        {meal.planned ? (
          <Button onPress={confirmEaten}>
            <Feather name="check" size={16} color={colors.background} />
            <Text className="font-bold text-primary-foreground">I ate this</Text>
          </Button>
        ) : null}
        <Button variant="outline" onPress={() => void adjustLeftovers()} disabled={adjusting}>
          {adjusting ? (
            <Spinner />
          ) : (
            <>
              <Feather name="camera" size={16} color={colors.foreground} />
              <Text className="font-bold text-foreground">Didn't finish? Snap the plate</Text>
            </>
          )}
        </Button>
        <View className="flex-row gap-2">
          <Button variant={favorite ? "default" : "outline"} className="flex-1" onPress={() => setFavorite(!favorite)}>
            <Feather name="star" size={16} color={favorite ? colors.background : colors.foreground} />
            <Text className={`font-bold ${favorite ? "text-primary-foreground" : "text-foreground"}`}>{favorite ? "Favorited" : "Favorite"}</Text>
          </Button>
          <Button variant="outline" className="flex-1" onPress={logAgain}>
            <Feather name="copy" size={16} color={colors.foreground} />
            <Text className="font-bold text-foreground">Log again</Text>
          </Button>
          <Button variant="outline" size="icon" accessibilityLabel="Delete meal" onPress={removeMeal}>
            <Feather name="trash-2" size={18} color={colors.foreground} />
          </Button>
        </View>
        <Button onPress={saveChanges}>Save changes</Button>
      </View>

      <TimePickerSheet
        open={timeOpen}
        onClose={() => setTimeOpen(false)}
        hour={time.h}
        minute={time.m}
        capNow={dateStr === localDateString()}
        onChange={(h, m) => setTime({ h, m })}
      />
    </View>
  );
}
