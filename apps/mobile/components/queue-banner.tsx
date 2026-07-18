import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeOutUp, useReducedMotion } from "react-native-reanimated";
import { flushQueue, subscribeQueue } from "../lib/queue";
import { useColors } from "../lib/colors";

// Ambient status pill while offline saves wait in the queue — the meals are
// already on Today, this just says why they haven't reached the server yet.
export function QueueBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => subscribeQueue(setCount), []);

  if (count === 0) return null;
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInUp.duration(130)}
      exiting={reduce ? undefined : FadeOutUp.duration(130)}
      pointerEvents="box-none"
      style={{ position: "absolute", left: 20, right: 20, top: insets.top + 4 }}
    >
      <View className="flex-row items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5">
        <Feather name="cloud-off" size={14} color={colors.foreground} />
        <Text className="flex-1 text-xs font-bold text-foreground" numberOfLines={1}>
          {count === 1 ? "1 meal" : `${count} meals`} saved on this phone — syncing when you're back online
        </Text>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => void flushQueue()} className="active:opacity-60">
          <Text className="text-xs font-black uppercase tracking-[1px] text-foreground underline">Retry</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
