import { Pressable, type PressableProps } from "react-native";
import { cssInterop } from "nativewind";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";
import { tapLight } from "../lib/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
cssInterop(AnimatedPressable, { className: "style" });

const TIMING = { duration: 130, easing: Easing.out(Easing.quad) };

/** A Pressable that eases to 0.96 on touch (with an optional light haptic) so
 *  every tap feels alive. Drop-in for Pressable — takes className + children. */
export function PressableScale({
  children,
  haptic,
  onPressIn,
  onPressOut,
  onPress,
  ...props
}: PressableProps & { haptic?: boolean; className?: string }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      style={style}
      onPressIn={(e) => {
        scale.value = withTiming(0.96, TIMING);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, TIMING);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) tapLight();
        onPress?.(e);
      }}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
}
