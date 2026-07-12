import { useEffect, useState } from "react";
import { Modal, View, Text, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";

const STEPS = ["Identifying foods", "Estimating portions", "Checking the database", "Adding up the macros"];

/** Full-screen "the AI is working" state: pulsing photo + ticking checklist. */
export function AnalyzingOverlay({ photoUri }: { photoUri?: string }) {
  const [step, setStep] = useState(0);
  const glow = useSharedValue(0.5);

  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
    const id = setInterval(() => setStep((s) => (s + 1) % (STEPS.length + 1)), 1100);
    return () => clearInterval(id);
  }, [glow]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.9 + glow.value * 0.15 }] }));

  return (
    <Modal visible transparent animationType="fade">
      <View className="flex-1 items-center justify-center gap-9 bg-background/95 px-8">
        <View className="items-center justify-center">
          <Animated.View style={glowStyle} className="absolute h-64 w-64 rounded-full bg-block-lime" />
          <View className="h-52 w-52 items-center justify-center overflow-hidden rounded-[32px] bg-block-lime">
            {photoUri ? (
              <Image source={{ uri: photoUri }} className="h-full w-full" />
            ) : (
              <Feather name="coffee" size={64} color="#000" />
            )}
          </View>
        </View>

        <View className="items-center gap-5">
          <Text className="text-2xl font-semibold tracking-tight text-foreground">Reading your plate…</Text>
          <View className="gap-2.5">
            {STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <View key={label} className={`flex-row items-center gap-2.5 ${active ? "opacity-100" : done ? "opacity-60" : "opacity-40"}`}>
                  <View className={`h-4 w-4 items-center justify-center rounded-full border ${done ? "border-transparent bg-foreground" : active ? "border-foreground" : "border-muted-foreground"}`}>
                    {done ? <Feather name="check" size={10} color="#fff" /> : null}
                  </View>
                  <Text className="text-xs font-bold uppercase tracking-wider text-foreground">{label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
