import { useRef } from "react";
import { Animated, Easing, Pressable, type PressableProps } from "react-native";
import { tapLight } from "../lib/haptics";

// RN's own Animated (not Reanimated): NativeWind 4 merges className with plain
// Animated.Value styles, but silently DROPS className when a Reanimated 4
// animated style shares the element (its worklet styles aren't recognized).
// Native-driver timing keeps the ease off the JS thread, same as before.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TIMING = { duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true };

/** A Pressable that eases to 0.96 on touch (with an optional light haptic) so
 *  every tap feels alive. Drop-in for Pressable — takes className + children. */
export function PressableScale({
  children,
  haptic,
  onPressIn,
  onPressOut,
  onPress,
  style,
  ...props
}: PressableProps & { haptic?: boolean; className?: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <AnimatedPressable
      style={[style as never, { transform: [{ scale }] }]}
      onPressIn={(e) => {
        Animated.timing(scale, { toValue: 0.96, ...TIMING }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.timing(scale, { toValue: 1, ...TIMING }).start();
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
