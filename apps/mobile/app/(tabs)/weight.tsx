import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Weight() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="p-5">
        <Text className="text-muted-foreground text-xs font-bold uppercase tracking-[3px]">
          Trend desk
        </Text>
        <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Weight</Text>
      </View>
    </SafeAreaView>
  );
}
