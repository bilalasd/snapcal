import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Stub — full multi-step onboarding (reuses @mealio/shared bmr) built next.
export default function Onboarding() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-2xl font-black text-foreground">Onboarding</Text>
        <Text className="mt-2 text-center text-muted-foreground">Coming next in Phase 3.</Text>
      </View>
    </SafeAreaView>
  );
}
