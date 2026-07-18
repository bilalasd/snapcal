import { useEffect } from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  value: number;
  max: number;
  label: string;
  sublabel: string;
  size?: "default" | "compact";
}

// Lives on the lime block card (Today hero), which is the same pastel in both
// themes — so the ring uses fixed inks, not themed tokens (near-white
// foreground would vanish on lime in dark).
const INK = "#000000";
const TRACK = "rgba(0, 0, 0, 0.12)";
const OVER = "#d92d20";

export function ProgressRing({ value, max, label, sublabel, size = "default" }: ProgressRingProps) {
  const reduce = useReducedMotion();
  const radius = 84;
  const stroke = 16;
  const circumference = 2 * Math.PI * radius;
  const fraction = max > 0 ? Math.min(value / max, 1) : 0;
  const over = max > 0 && value > max;
  const px = size === "compact" ? 128 : 208;

  // Eases to the new fill on data changes; initialized at the current fraction
  // so mounting never plays a decorative sweep.
  const progress = useSharedValue(fraction);
  useEffect(() => {
    progress.value = reduce
      ? fraction
      : withTiming(fraction, { duration: 130, easing: Easing.out(Easing.quad) });
  }, [fraction, reduce, progress]);
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View className="items-center">
      <View style={{ width: px, height: px }}>
        <Svg viewBox="0 0 200 200" width={px} height={px} style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={100} cy={100} r={radius} fill="none" strokeWidth={stroke} stroke={TRACK} />
          <AnimatedCircle
            cx={100}
            cy={100}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            animatedProps={arcProps}
            stroke={over ? OVER : INK}
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text
            className={`font-black tracking-tighter tabular-nums ${size === "compact" ? "text-2xl" : "text-4xl"}`}
            style={{ color: over ? OVER : INK }}
          >
            {label}
          </Text>
          <Text className="text-xs font-bold uppercase tracking-[2px] text-black/60">
            {sublabel}
          </Text>
        </View>
      </View>
    </View>
  );
}
