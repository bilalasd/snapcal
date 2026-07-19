import { View, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { mealTotals, type ApiMeal } from "@loggi/shared";
import { deleteMeal, stashLogAgain } from "../lib/meal-actions";
import { tapLight } from "../lib/haptics";
import { PressableScale } from "./pressable-scale";
import { Photo } from "./photo";

// Time-of-day glyph on a pastel block so photo-less meals read at a glance.
function mealGlyph(hour: number): { icon: keyof typeof Feather.glyphMap; block: string } {
  if (hour < 11) return { icon: "sunrise", block: "bg-block-cream" };
  if (hour < 16) return { icon: "sun", block: "bg-block-lime" };
  if (hour < 21) return { icon: "sunset", block: "bg-block-coral" };
  return { icon: "moon", block: "bg-block-lilac" };
}

export function MealListItem({
  meal,
  onPress,
  onChanged,
}: {
  meal: ApiMeal;
  onPress?: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const totals = mealTotals(meal);
  const eaten = new Date(meal.eatenAt);
  const time = eaten.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const { icon, block } = mealGlyph(eaten.getHours());

  // Fast lane only — every action here is also reachable via tap → drawer.
  function quickMenu() {
    if (!onChanged) return;
    tapLight();
    Alert.alert(meal.name, `${totals.calories} cal`, [
      {
        text: "Log again",
        onPress: () => {
          stashLogAgain(meal);
          router.push("/add");
        },
      },
      { text: "Delete", style: "destructive", onPress: () => deleteMeal(meal, onChanged) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <PressableScale
      haptic
      onPress={onPress}
      onLongPress={onChanged ? quickMenu : undefined}
      className="flex-row items-stretch gap-3 rounded-3xl border border-border bg-card p-3"
    >
      {meal.photos.length > 0 ? (
        <Photo source={{ uri: meal.photos[0].url }} className="h-16 w-16 rounded-2xl" />
      ) : (
        <View className={`h-16 w-16 items-center justify-center rounded-2xl ${block}`}>
          <Feather name={icon} size={26} color="#000000" />
        </View>
      )}
      <View className="min-w-0 flex-1 justify-between py-0.5">
        <View>
          <Text className="text-muted-foreground text-xs font-extrabold uppercase tracking-[2px]">
            {meal.planned ? "Planned · tap to confirm" : time}
          </Text>
          <Text numberOfLines={1} className="text-lg font-black tracking-tight text-foreground">
            {meal.name}
          </Text>
        </View>
        <Text className="text-muted-foreground text-xs font-semibold">
          P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · F {Math.round(totals.fat)}g
        </Text>
      </View>
      <View className="min-w-16 items-end justify-center border-l border-border pl-3">
        <Text className="text-2xl font-black tabular-nums tracking-tight text-foreground">
          {totals.calories}
        </Text>
        <Text className="text-muted-foreground text-[10px] font-extrabold uppercase tracking-[2px]">
          cal
        </Text>
      </View>
    </PressableScale>
  );
}
