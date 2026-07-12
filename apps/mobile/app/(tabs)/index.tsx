import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Phase 1 placeholder — proves NativeWind theme + layout render. The real Today
// screen (progress ring, macros, day nav, streak) is rebuilt in Phase 3.
export default function Today() {
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
            Still available
          </Text>
          <Text className="mt-1 text-6xl font-black tracking-tighter text-foreground">1,875</Text>
          <Text className="text-sm font-bold uppercase tracking-[2px] text-muted-foreground">
            cal left
          </Text>
        </View>

        <Text className="text-muted-foreground">
          Mealio — Phase 1 shell. Real screens land in Phase 3.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
