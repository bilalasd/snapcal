import { useRef, useState } from "react";
import { View, Pressable, Text, Easing as RNEasing } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS, useReducedMotion } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { tapLight } from "../../lib/haptics";
import { stashTranscript } from "../../lib/draft";
import { useColors } from "../../lib/colors";
import { ToastHost } from "../../components/toast";
import { QueueBanner } from "../../components/queue-banner";

// dx/dy are the action-circle centers relative to the + button center —
// they drive both the fan-out animation and the drag hit-testing.
const ACTIONS = [
  { icon: "search", label: "Search", intent: "search", dx: -104, dy: -44 },
  { icon: "camera", label: "Camera", intent: "camera", dx: -38, dy: -106 },
  { icon: "mic", label: "Speak", intent: "speak", dx: 38, dy: -106 },
  { icon: "bookmark", label: "Saved", intent: "saved", dx: 104, dy: -44 },
] as const;
// Drags select by direction (pie-menu style): past this distance, the action
// whose bearing is within ~60° of the drag wins — no need to reach the icon.
const MIN_DRAG = 24;
const MIN_DOT = 0.5; // cos 60°
const MIC_INDEX = ACTIONS.findIndex((a) => a.intent === "speak");

export default function TabsLayout() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const barTop = insets.bottom + 49; // bottom tab bar height = content (49) + safe-area inset
  const [fabOpen, setFabOpen] = useState(false);
  const openSv = useSharedValue(0);
  const activeSv = useSharedValue(-1); // which action the drag is hovering
  const duration = useReducedMotion() ? 0 : 130;

  function toggleFab(next = !fabOpen) {
    tapLight();
    setFabOpen(next);
    openSv.value = withTiming(next ? 1 : 0, { duration, easing: Easing.out(Easing.cubic) });
  }

  function go(intent: string) {
    toggleFab(false);
    router.push(`/add?intent=${intent}`);
  }

  // Hold-to-talk: sliding onto the mic starts transcribing right there in the
  // dial; releasing stops and hands the words to /add for analysis. Sliding
  // away cancels. A plain tap on the mic still opens the full speak screen —
  // the gesture is the fast lane, not the only lane.
  const [dictState, setDictState] = useState<"idle" | "live" | "finishing">("idle");
  const [heard, setHeard] = useState("");
  const dictRef = useRef<"idle" | "live" | "finishing">("idle");
  const finalRef = useRef("");
  const interimRef = useRef("");
  const recActive = useRef(false);

  function setDict(s: "idle" | "live" | "finishing") {
    dictRef.current = s;
    setDictState(s);
  }

  function startDictation() {
    if (dictRef.current !== "idle") return;
    finalRef.current = "";
    interimRef.current = "";
    setHeard("");
    setDict("live");
    // Only transcribe mid-gesture if the mic is already granted — a permission
    // dialog under a held finger is chaos. First-timers get the speak screen,
    // which asks properly.
    ExpoSpeechRecognitionModule.getPermissionsAsync().then(({ granted }) => {
      if (granted && dictRef.current === "live") {
        ExpoSpeechRecognitionModule.start({ interimResults: true, continuous: true });
      }
    });
  }

  function cancelDictation() {
    if (dictRef.current === "idle") return;
    setDict("idle");
    setHeard("");
    ExpoSpeechRecognitionModule.abort();
  }

  function finishDictation() {
    if (dictRef.current !== "live") return;
    if (!recActive.current) {
      // Recognition never started (no permission yet / still warming up with
      // nothing heard) — the speak screen takes over and listens properly.
      setDict("idle");
      ExpoSpeechRecognitionModule.abort();
      go("speak");
      return;
    }
    setDict("finishing");
    ExpoSpeechRecognitionModule.stop(); // final result + "end" follow
  }

  // Fires on "end" (and defensively on "error") while finishing: pass whatever
  // was heard to /add. Empty transcript just opens the speak screen to listen.
  function settleDictation() {
    if (dictRef.current !== "finishing") return;
    setDict("idle");
    const text = [finalRef.current, interimRef.current].filter(Boolean).join(" ").trim();
    setHeard("");
    if (text) stashTranscript(text);
    go("speak");
  }

  useSpeechRecognitionEvent("start", () => {
    recActive.current = true;
  });
  useSpeechRecognitionEvent("result", (e) => {
    if (dictRef.current === "idle") return; // speak screen's session, not ours
    const transcript = e.results[0]?.transcript ?? "";
    if (e.isFinal) {
      finalRef.current = [finalRef.current, transcript].filter(Boolean).join(" ");
      interimRef.current = "";
    } else {
      interimRef.current = transcript;
    }
    setHeard([finalRef.current, interimRef.current].filter(Boolean).join(" "));
  });
  useSpeechRecognitionEvent("end", () => {
    recActive.current = false;
    settleDictation();
  });
  useSpeechRecognitionEvent("error", () => {
    settleDictation();
  });

  // One gesture does it all: touch-down opens the dial instantly; drag onto an
  // action and release to trigger it; release in place keeps it open for
  // tap-to-choose; a plain tap while open closes it again.
  const wasOpen = useSharedValue(0);
  const drag = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      wasOpen.value = openSv.value > 0.5 ? 1 : 0;
      activeSv.value = -1;
      if (!wasOpen.value) runOnJS(toggleFab)(true);
    })
    .onUpdate((e) => {
      let idx = -1;
      const dist = Math.hypot(e.translationX, e.translationY);
      if (dist > MIN_DRAG) {
        let best = MIN_DOT;
        for (let i = 0; i < ACTIONS.length; i++) {
          const a = ACTIONS[i];
          const dot = (e.translationX * a.dx + e.translationY * a.dy) / (dist * Math.hypot(a.dx, a.dy));
          if (dot > best) {
            best = dot;
            idx = i;
          }
        }
      }
      const prev = activeSv.value;
      if (idx !== prev) {
        activeSv.value = idx;
        if (idx >= 0) runOnJS(tapLight)();
        // Entering the mic starts transcribing under the held finger;
        // sliding off it throws the words away.
        if (idx === MIC_INDEX) runOnJS(startDictation)();
        else if (prev === MIC_INDEX) runOnJS(cancelDictation)();
      }
    })
    .onFinalize((e) => {
      const idx = activeSv.value;
      activeSv.value = -1;
      if (idx === MIC_INDEX) runOnJS(finishDictation)();
      else if (idx >= 0) runOnJS(go)(ACTIONS[idx].intent);
      else {
        runOnJS(cancelDictation)();
        if (wasOpen.value && Math.hypot(e.translationX, e.translationY) < 10) runOnJS(toggleFab)(false);
      }
    });

  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${openSv.value * 45}deg` }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: openSv.value }));
  // One timing value drives all three: fan out from behind the + button.
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
  const circleStyles = ACTIONS.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- ACTIONS is a module constant, order is stable
    useAnimatedStyle(() => ({
      transform: [{ scale: withTiming(activeSv.value === i ? 1.15 : 1, { duration, easing: Easing.out(Easing.cubic) }) }],
    })),
  );

  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{
          headerShown: false,
          animation: "shift",
          transitionSpec: { animation: "timing", config: { duration, easing: RNEasing.out(RNEasing.cubic) } },
          tabBarActiveTintColor: colors.foreground,
          tabBarInactiveTintColor: colors.mutedForeground,
          tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
          tabBarLabelStyle: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Today", tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color} /> }}
        />
        <Tabs.Screen
          name="history"
          options={{ title: "History", tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size - 2} color={color} /> }}
        />
        {/* Empty middle slot: reserves room in the bar for the floating + so the
            neighboring tabs aren't crowded against it. */}
        <Tabs.Screen name="log" options={{ tabBarButton: () => <View style={{ flex: 1 }} /> }} />
        <Tabs.Screen
          name="weight"
          options={{ title: "Weight", tabBarIcon: ({ color, size }) => <Feather name="trending-up" size={size - 2} color={color} /> }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Feather name="settings" size={size - 2} color={color} /> }}
        />
      </Tabs>

      {/* Tap-away backdrop while the dial is open. Always mounted so the
          fade-out plays on close (unmounting would snap it away). */}
      <Animated.View
        pointerEvents={fabOpen ? "auto" : "none"}
        accessibilityElementsHidden={!fabOpen}
        importantForAccessibility={fabOpen ? "auto" : "no-hide-descendants"}
        style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, backdropStyle]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close log menu"
          className="flex-1 bg-black/30"
          onPress={() => toggleFab(false)}
        />
      </Animated.View>

      {/* Live transcript while the mic is held (hold-to-talk) */}
      {dictState !== "idle" ? (
        <View
          pointerEvents="none"
          className="absolute inset-x-5 rounded-2xl border border-border bg-background p-4"
          style={{ bottom: barTop + 96 }}
        >
          <View className="flex-row items-center gap-2">
            <View className="h-2.5 w-2.5 rounded-full bg-accent-log" />
            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
              {dictState === "finishing" ? "Got it…" : "Listening — release when done"}
            </Text>
          </View>
          <Text numberOfLines={3} className="mt-2 text-lg font-bold leading-6 tracking-tight text-foreground">
            {heard || "Say what you ate…"}
          </Text>
        </View>
      ) : null}

      {/* Speed-dial actions fanning out of the + button */}
      {ACTIONS.map((a, i) => (
        <Animated.View
          key={a.intent}
          pointerEvents={fabOpen ? "auto" : "none"}
          accessibilityElementsHidden={!fabOpen}
          importantForAccessibility={fabOpen ? "auto" : "no-hide-descendants"}
          style={[{ position: "absolute", bottom: barTop - 40, left: "50%", marginLeft: -36, width: 72 }, miniStyles[i]]}
        >
          <Pressable
            onPress={() => go(a.intent)}
            className="items-center gap-1 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            <Animated.View style={circleStyles[i]} className="h-14 w-14 items-center justify-center rounded-full bg-accent-log">
              <Feather name={a.icon} size={24} color="#fff" />
            </Animated.View>
            {/* Chip behind the label so it stays legible over whatever the scrim dims */}
            <Text className="overflow-hidden rounded-full bg-background px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-foreground">
              {a.label}
            </Text>
          </Pressable>
        </Animated.View>
      ))}

      {/* Center Add action, seated in the bar's empty middle slot. A background-
          colored "socket" ring masks the bar's hairline behind the button and
          redraws it as a circle, so the border reads as breaking around the
          button on purpose — same crisp line language as the rest of the UI. */}
      <GestureDetector gesture={drag}>
        <View
          // Anchored to the safe-area inset so devices without a home
          // indicator don't strand it mid-screen; center sits 6pt above the
          // bar's top edge.
          style={{ bottom: barTop - 32 }}
          className="absolute left-1/2 -ml-[38px] h-[76px] w-[76px] items-center justify-center rounded-full border border-border bg-background"
          accessible
          accessibilityRole="button"
          accessibilityLabel="Log a meal"
          accessibilityState={{ expanded: fabOpen }}
        >
          <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-log">
            <Animated.View style={plusStyle}>
              <Feather name="plus" size={26} color="#fff" />
            </Animated.View>
          </View>
        </View>
      </GestureDetector>

      {/* Floating overlays: undo toast above the FAB, offline pill up top */}
      <ToastHost bottomOffset={barTop + 56} />
      <QueueBanner />
    </View>
  );
}
