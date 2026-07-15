import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { mealTotals, type ApiMeal } from "@loggi/shared";
import { PressableScale } from "./pressable-scale";
import { Photo } from "./photo";

// Time-of-day glyph on a pastel block so photo-less meals read at a glance.
function mealGlyph(hour: number): { icon: keyof typeof Feather.glyphMap; block: string } {
  if (hour < 11) return { icon: "sunrise", block: "bg-block-cream" };
  if (hour < 16) return { icon: "sun", block: "bg-block-lime" };
  if (hour < 21) return { icon: "sunset", block: "bg-block-coral" };
  return { icon: "moon", block: "bg-block-lilac" };
}

export function MealListItem({ meal, onPress }: { meal: ApiMeal; onPress?: () => void }) {
  const totals = mealTotals(meal);
  const eaten = new Date(meal.eatenAt);
  const time = eaten.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const { icon, block } = mealGlyph(eaten.getHours());

  return (
    <PressableScale
      haptic
      onPress={onPress}
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
            {time}
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
