import { Pressable, type PressableProps } from "react-native";
import { cssInterop } from "nativewind";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { tapLight } from "../lib/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
cssInterop(AnimatedPressable, { className: "style" });

const SPRING = { damping: 18, stiffness: 320, mass: 0.5 };

/** A Pressable that springs to 0.96 on touch (with an optional light haptic) so
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
        scale.value = withSpring(0.96, SPRING);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING);
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
