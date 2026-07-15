import Animated, { FadeIn } from "react-native-reanimated";

const POSES = {
  clipboard: require("../assets/bevi/clipboard.png"),
  standing: require("../assets/bevi/standing.png"),
} as const;

/** Bevi the Beaver — Loggi's mascot. One appearance per screen, keep it sparse. */
export function Bevi({ pose, size = 140 }: { pose: keyof typeof POSES; size?: number }) {
  return (
    <Animated.Image
      entering={FadeIn.duration(130)}
      source={POSES[pose]}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
