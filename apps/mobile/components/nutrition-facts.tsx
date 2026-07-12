import { View, Text } from "react-native";
import type { DraftItem } from "@mealio/shared";

function sumField(items: DraftItem[], key: "sat_fat_g" | "fiber_g" | "sugar_g" | "sodium_mg"): number | null {
  if (!items.some((i) => i[key] != null)) return null;
  return items.reduce((sum, i) => sum + (i[key] ?? 0), 0);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** FDA-style Nutrition Facts panel for the whole meal. */
export function NutritionFacts({ items }: { items: DraftItem[] }) {
  const calories = items.reduce((s, i) => s + (i.calories || 0), 0);
  const protein = round1(items.reduce((s, i) => s + (i.protein_g || 0), 0));
  const carbs = round1(items.reduce((s, i) => s + (i.carbs_g || 0), 0));
  const fat = round1(items.reduce((s, i) => s + (i.fat_g || 0), 0));
  const satFat = sumField(items, "sat_fat_g");
  const fiber = sumField(items, "fiber_g");
  const sugar = sumField(items, "sugar_g");
  const sodium = sumField(items, "sodium_mg");

  const fmt = (n: number | null, unit: string) => (n === null ? "—" : `${round1(n)}${unit}`);
  const anyMissing = satFat === null || fiber === null || sugar === null || sodium === null;

  return (
    <View className="rounded-lg border-2 border-foreground bg-card p-3">
      <Text className="text-xl font-extrabold text-foreground">Nutrition Facts</Text>
      <Text className="text-muted-foreground text-xs">Whole meal</Text>
      <View className="my-1 h-1 bg-foreground" />
      <View className="flex-row items-end justify-between border-b-4 border-foreground pb-1">
        <Text className="font-bold text-foreground">Calories</Text>
        <Text className="text-2xl font-extrabold tabular-nums text-foreground">{calories}</Text>
      </View>

      <Row label="Total Fat" value={fmt(fat, "g")} bold />
      <Row label="Saturated Fat" value={fmt(satFat, "g")} indent />
      <Row label="Sodium" value={fmt(sodium, "mg")} bold />
      <Row label="Total Carbohydrate" value={fmt(carbs, "g")} bold />
      <Row label="Dietary Fiber" value={fmt(fiber, "g")} indent />
      <Row label="Total Sugars" value={fmt(sugar, "g")} indent />
      <View className="h-1 bg-foreground" />
      <Row label="Protein" value={fmt(protein, "g")} bold />

      {anyMissing && (
        <Text className="text-muted-foreground mt-2 text-[10px]">
          — = not estimated. Values are AI estimates, not lab-measured.
        </Text>
      )}
    </View>
  );
}

function Row({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <View className={`flex-row items-center justify-between border-b border-border py-1 ${indent ? "pl-4" : ""}`}>
      <Text className={`text-sm text-foreground ${bold ? "font-bold" : ""}`}>{label}</Text>
      <Text className="text-sm tabular-nums text-foreground">{value}</Text>
    </View>
  );
}
