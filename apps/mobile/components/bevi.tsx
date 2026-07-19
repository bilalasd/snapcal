import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";

const POSES = {
  clipboard: require("../assets/bevi/clipboard.png"),
  standing: require("../assets/bevi/standing.png"),
  camera: require("../assets/bevi/camera.png"),
  scale: require("../assets/bevi/scale.png"),
  promise: require("../assets/bevi/promise.png"),
  wave: require("../assets/bevi/wave.png"),
  celebrate: require("../assets/bevi/celebrate.png"),
} as const;

/** Bevi the Beaver — Loggi's mascot. One appearance per screen, keep it sparse.
 *  `delay` slots the fade into a screen's entrance stagger. */
export function Bevi({ pose, size = 140, delay = 0 }: { pose: keyof typeof POSES; size?: number; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <Animated.Image
      entering={reduce ? undefined : FadeIn.duration(130).delay(delay)}
      source={POSES[pose]}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
