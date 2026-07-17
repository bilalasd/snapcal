import { useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { localDateString, mealTotals, type DraftItem } from "@loggi/shared";
import { fetchJson } from "../lib/api";
import { resizeToPhoto, pickPhotos, type EncodedImage } from "../lib/image";
import { getCachedGoals, getCachedMeals, getCachedTrends } from "../lib/cache";
import { Bevi } from "../components/bevi";
import { Button, Badge, Kicker, Spinner } from "../components/ui";
import { useColors, block } from "../lib/colors";

type MenuFit = "fits" | "tight" | "over";

interface MenuDish {
  name: string;
  portion_note: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fit: MenuFit;
}

interface MenuResult {
  is_menu: boolean;
  remaining_kcal: number;
  dishes: MenuDish[];
}

const FIT_META: Record<MenuFit, { label: string; bg: string }> = {
  fits: { label: "Fits", bg: block.mint },
  tight: { label: "Tight", bg: block.cream },
  over: { label: "Over budget", bg: block.coral },
};

/** Today's still-available calories from the local cache — the same numbers
 *  the home screen shows (goal − eaten − reserved). */
function remainingToday(): { remaining: number; goal: number } {
  const goals = getCachedGoals();
  const trends = getCachedTrends<{ adaptive_goal_kcal: number | null }>();
  const goal =
    (goals?.adaptive_goal ? (trends?.adaptive_goal_kcal ?? null) : null) ??
    goals?.daily_calories ??
    2000;
  const meals = getCachedMeals(localDateString(new Date())) ?? [];
  const used = meals.reduce((sum, m) => sum + mealTotals(m).calories, 0);
  return { remaining: Math.max(0, goal - used), goal };
}

export default function MenuScout() {
  const router = useRouter();
  const colors = useColors();
  const [busy, setBusy] = useState<"reading" | "reserving" | null>(null);
  const [result, setResult] = useState<MenuResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function scan(image: EncodedImage | null) {
    if (!image) return;
    setBusy("reading");
    setError(null);
    try {
      const { remaining, goal } = remainingToday();
      const res = await fetchJson<MenuResult>("/api/menu", {
        method: "POST",
        body: JSON.stringify({
          image,
          remaining_kcal: remaining,
          daily_goal_kcal: goal,
        }),
      });
      if (!res.is_menu || res.dishes.length === 0) {
        setError("That doesn't look like a menu — try a straighter, closer shot.");
      } else {
        setResult(res);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that menu.");
    } finally {
      setBusy(null);
    }
  }

  async function snapMenu() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (res.canceled || res.assets.length === 0) return;
    // Menus carry small type — resize wider than food photos (1280 vs 768).
    const photo = await resizeToPhoto(res.assets[0].uri, 1280);
    void scan(photo.encoded);
  }

  async function pickMenu() {
    const photos = await pickPhotos(1);
    if (photos.length === 0) return;
    const photo = await resizeToPhoto(photos[0].uri, 1280);
    void scan(photo.encoded);
  }

  function reserve(dish: MenuDish) {
    Alert.alert(
      `Reserve ~${dish.calories.toLocaleString()} cal?`,
      `${dish.name} goes on Today as planned — Bevi holds the budget until you confirm it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reserve",
          onPress: () => {
            setBusy("reserving");
            const item: DraftItem = {
              name: dish.name,
              portion: dish.portion_note,
              calories: dish.calories,
              protein_g: dish.protein_g,
              carbs_g: dish.carbs_g,
              fat_g: dish.fat_g,
            };
            fetchJson("/api/meals", {
              method: "POST",
              body: JSON.stringify({
                name: dish.name,
                eaten_at: new Date().toISOString(),
                source: "text", // ponytail: no "menu" source enum — text is honest enough
                planned: true,
                items: [item],
              }),
            })
              .then(() => router.replace("/"))
              .catch((err) => {
                setBusy(null);
                Alert.alert(
                  "Couldn't reserve that",
                  err instanceof Error ? err.message : "Try again.",
                );
              });
          },
        },
      ],
    );
  }

  const grouped: MenuFit[] = ["fits", "tight", "over"];

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-start justify-between px-5 pb-3 pt-4">
        <View>
          <Kicker>Menu scout</Kicker>
          <Text className="mt-1 text-3xl font-black tracking-tight text-foreground">
            Eating out?
          </Text>
        </View>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Close menu scout"
          onPress={() => router.back()}
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </Button>
      </View>

      {busy === "reading" ? (
        <View className="flex-1 items-center justify-center gap-3">
          <Spinner color={colors.mutedForeground} />
          <Text className="text-sm text-muted-foreground">Bevi's reading the menu…</Text>
        </View>
      ) : result ? (
        <ScrollView className="flex-1 px-5" contentContainerClassName="gap-4 pb-10">
          <Text className="text-sm text-muted-foreground">
            {result.remaining_kcal.toLocaleString()} cal still available today. Portions are
            my best guess from the menu — worth a quick check when the plate lands.
          </Text>
          {grouped.map((fit) => {
            const dishes = result.dishes.filter((d) => d.fit === fit);
            if (dishes.length === 0) return null;
            return (
              <View key={fit} className="gap-2">
                <Kicker>{FIT_META[fit].label}</Kicker>
                {dishes.map((dish) => (
                  <Pressable
                    key={`${dish.name}-${dish.calories}`}
                    onPress={() => reserve(dish)}
                    disabled={busy === "reserving"}
                    className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 active:opacity-70"
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="font-bold text-foreground" numberOfLines={1}>
                        {dish.name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
                        {dish.portion_note} · P{dish.protein_g} C{dish.carbs_g} F{dish.fat_g}
                      </Text>
                    </View>
                    <Badge style={{ backgroundColor: FIT_META[fit].bg }}>
                      <Text className="text-xs font-bold text-black">
                        {dish.calories.toLocaleString()} cal
                      </Text>
                    </Badge>
                  </Pressable>
                ))}
              </View>
            );
          })}
          <Button variant="outline" onPress={() => setResult(null)}>
            <Feather name="camera" size={16} color={colors.foreground} />
            <Text className="font-bold text-foreground">Scan another menu</Text>
          </Button>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center gap-4 px-8 pb-16">
          <Bevi pose="camera" size={130} />
          <Text className="text-center text-sm text-muted-foreground">
            Point the camera at the menu and I'll rank the dishes against what's left of
            your day. Tap one to reserve the calories before you order.
          </Text>
          {error ? (
            <Text className="text-center text-sm font-semibold text-destructive">{error}</Text>
          ) : null}
          <Button onPress={() => void snapMenu()}>
            <Feather name="camera" size={16} color={colors.background} />
            <Text className="font-bold text-primary-foreground">Snap the menu</Text>
          </Button>
          <Button variant="ghost" onPress={() => void pickMenu()}>
            <Text className="font-bold text-muted-foreground">Choose a photo instead</Text>
          </Button>
        </View>
      )}
    </View>
  );
}
