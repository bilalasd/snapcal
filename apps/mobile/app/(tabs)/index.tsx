import { useEffect, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Goals } from "@mealio/shared";
import { fetchJson } from "../../lib/api";

// Phase 2: proves the authed API round-trip. Real Today screen (progress ring,
// macros, day nav, streak) is rebuilt in Phase 3.
export default function Today() {
  const [goals, setGoals] = useState<Goals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<Goals>("/api/goals")
      .then(setGoals)
      .catch((e) => setError(e.message));
  }, []);

  const target = goals?.daily_calories ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="p-5 gap-5">
        <View>
          <Text className="text-muted-foreground text-xs font-bold uppercase tracking-[3px]">
            Today
          </Text>
          <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">
            Good afternoon
          </Text>
        </View>

        <View className="rounded-3xl bg-block-lime p-5">
          <Text className="text-xs font-bold uppercase tracking-[2px] text-foreground">
            Daily target
          </Text>
          <Text className="mt-1 text-6xl font-black tracking-tighter text-foreground">
            {target ? target.toLocaleString() : "—"}
          </Text>
          <Text className="text-sm font-bold uppercase tracking-[2px] text-muted-foreground">
            cal
          </Text>
        </View>

        <Text className="text-muted-foreground">
          {error
            ? `API error: ${error}`
            : goals
              ? "Connected to the API with your Clerk session."
              : "Loading your goals…"}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
