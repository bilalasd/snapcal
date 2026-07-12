import { View, Pressable } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";

export default function TabsLayout() {
  const router = useRouter();
  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#000000",
          tabBarInactiveTintColor: "#565656",
          tabBarLabelStyle: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Today", tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="history"
          options={{ title: "History", tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="weight"
          options={{ title: "Weight", tabBarIcon: ({ color, size }) => <Ionicons name="trending-up-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} /> }}
        />
      </Tabs>

      {/* Center Add action, floating above the bar (matches the web tab bar's "+"). */}
      <Pressable
        onPress={() => router.push("/add")}
        className="absolute bottom-16 left-1/2 -ml-7 h-14 w-14 items-center justify-center rounded-full bg-magenta shadow-lg active:opacity-80"
        accessibilityLabel="Log a meal"
      >
        <Feather name="plus" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}
