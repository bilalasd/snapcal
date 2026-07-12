import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Stub — full Add flow (camera → analyze → questions → review → save) built next.
export default function Add() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-2xl font-black text-foreground">Add a meal</Text>
        <Text className="mt-2 text-center text-muted-foreground">Camera + analyze flow lands next.</Text>
      </View>
    </SafeAreaView>
  );
}
