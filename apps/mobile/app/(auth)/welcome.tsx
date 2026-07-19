import { useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, useWindowDimensions } from "react-native";
import Animated, { Easing, FadeIn, FadeInUp, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { Bevi } from "../../components/bevi";
import { Button, Kicker } from "../../components/ui";

// The pitch lives *before* the account ask: a fresh install lands here, hears
// what Loggi is, and only then pays the sign-up cost. Signed-in users never
// see this screen (AuthGate bounces them to the tabs).
const SCREENS = [
  {
    pose: "camera" as const,
    kicker: "Meet Bevi",
    title: "Point it at anything edible.",
    body: "Plate, nutrition label, or barcode — one camera reads them all. A meal takes seconds to log, so you'll actually keep logging.",
  },
  {
    pose: "scale" as const,
    kicker: "The smart part",
    title: "Your target comes from your scale, not a formula.",
    body: "I'll start with a good estimate today. As you log and weigh in, I measure what your body actually burns and adjust your target every Monday — so you always know if the plan is working.",
  },
  {
    pose: "promise" as const,
    kicker: "The deal",
    title: "No tricks.",
    body: "I'll tell you when I'm guessing on a portion. And your data is yours — never sold, never used for ads. Export everything or delete everything, one tap in Settings.",
  },
];

export default function Welcome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === SCREENS.length - 1;

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: !reduce });
    setPage(i);
  };
  const start = () => router.push("/(auth)/sign-up");

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Animated.View entering={reduce ? undefined : FadeIn.duration(130)} style={{ flex: 1 }}>
        <View className="h-11 flex-row items-center justify-end px-5">
          <Pressable onPress={start} accessibilityRole="button" hitSlop={10} className="active:opacity-60">
            <Text className="text-sm font-bold text-muted-foreground">Skip</Text>
          </Pressable>
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {SCREENS.map((s) => (
            <View key={s.title} style={{ width }} className="justify-center gap-5 px-5">
              <View className="items-center">
                <Bevi pose={s.pose} size={180} />
              </View>
              {/* Entrance stagger (first frame of the app): text settles in a beat
                  after Bevi. Offscreen slides play theirs unseen at mount. */}
              <Animated.View
                entering={reduce ? undefined : FadeInUp.duration(130).delay(40).easing(Easing.out(Easing.quad))}
              >
                <Kicker>{s.kicker}</Kicker>
                <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">{s.title}</Text>
                <Text className="mt-4 text-sm font-semibold text-muted-foreground">{s.body}</Text>
              </Animated.View>
            </View>
          ))}
        </ScrollView>
        <Animated.View entering={reduce ? undefined : FadeIn.duration(130).delay(80).easing(Easing.out(Easing.quad))}>
          <View className="gap-4 px-5 pb-6">
            <View className="flex-row justify-center gap-1.5">
            {SCREENS.map((s, i) => (
              <Animated.View
                key={s.title}
                layout={reduce ? undefined : LinearTransition.duration(130).easing(Easing.out(Easing.quad))}
                style={{ borderRadius: 999, overflow: "hidden" }}
              >
                <View className={`h-1.5 rounded-full ${i === page ? "w-6 bg-primary" : "w-1.5 bg-muted"}`} />
              </Animated.View>
            ))}
          </View>
          <Button onPress={() => (last ? start() : goTo(page + 1))}>{last ? "Get started" : "Next"}</Button>
          <View className="flex-row justify-center gap-1">
            <Text className="text-muted-foreground">Have an account?</Text>
            <Link href="/(auth)/sign-in" className="font-bold text-foreground">
              Sign in
            </Link>
          </View>
          </View>
        </Animated.View>
      </Animated.View>
    </SafeAreaView>
  );
}
