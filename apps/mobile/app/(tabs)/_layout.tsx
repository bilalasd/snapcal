import { useState } from "react";
import { View, Pressable } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";
import { tapLight } from "../../lib/haptics";

const ACTIONS = [
  { icon: "search", label: "Food database", intent: "search", dx: -76, dy: -48 },
  { icon: "camera", label: "Camera", intent: "camera", dx: 0, dy: -80 },
  { icon: "bookmark", label: "Saved foods", intent: "saved", dx: 76, dy: -48 },
] as const;

export default function TabsLayout() {
  const router = useRouter();
  const [fabOpen, setFabOpen] = useState(false);
  const openSv = useSharedValue(0);

  function toggleFab(next = !fabOpen) {
    tapLight();
    setFabOpen(next);
    openSv.value = withTiming(next ? 1 : 0, { duration: 130, easing: Easing.out(Easing.cubic) });
  }

  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${openSv.value * 45}deg` }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: openSv.value }));
  // One spring drives all three: fan out from behind the + button.
  const miniStyles = ACTIONS.map((a) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- ACTIONS is a module constant, order is stable
    useAnimatedStyle(() => ({
      opacity: openSv.value,
      transform: [
        { translateX: a.dx * openSv.value },
        { translateY: a.dy * openSv.value },
        { scale: 0.4 + 0.6 * openSv.value },
      ],
    })),
  );

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

      {/* Tap-away backdrop while the dial is open */}
      {fabOpen ? (
        <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, backdropStyle]}>
          <Pressable className="flex-1 bg-black/20" onPress={() => toggleFab(false)} />
        </Animated.View>
      ) : null}

      {/* Speed-dial actions fanning out of the + button */}
      {ACTIONS.map((a, i) => (
        <Animated.View
          key={a.intent}
          pointerEvents={fabOpen ? "auto" : "none"}
          style={[{ position: "absolute", bottom: 68, left: "50%", marginLeft: -22 }, miniStyles[i]]}
        >
          <Pressable
            onPress={() => {
              toggleFab(false);
              router.push(`/add?intent=${a.intent}`);
            }}
            className="h-11 w-11 items-center justify-center rounded-full bg-magenta shadow-lg active:opacity-80"
            accessibilityLabel={a.label}
          >
            <Feather name={a.icon} size={19} color="#fff" />
          </Pressable>
        </Animated.View>
      ))}

      {/* Center Add action, floating above the bar (matches the web tab bar's "+"). */}
      <Pressable
        onPress={() => toggleFab()}
        className="absolute bottom-16 left-1/2 -ml-7 h-14 w-14 items-center justify-center rounded-full bg-magenta shadow-lg active:opacity-80"
        accessibilityLabel="Log a meal"
      >
        <Animated.View style={plusStyle}>
          <Feather name="plus" size={26} color="#fff" />
        </Animated.View>
      </Pressable>
    </View>
  );
}
