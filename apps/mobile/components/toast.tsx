import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from "react-native-reanimated";

// One floating toast, last-write-wins — the host lives in the tabs layout.
// Every toast fires exactly one of onAction (tapped) or onExpire (timed out,
// replaced, or host unmounted), so "undo delete" can hang the real DELETE off
// onExpire without ever double-firing.

interface ToastData {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onExpire?: () => void;
}

const TOAST_MS = 5000;
let push: ((t: ToastData) => void) | null = null;
let nextId = 1;

export function showToast(
  message: string,
  opts?: { actionLabel?: string; onAction?: () => void; onExpire?: () => void },
) {
  if (push) push({ id: nextId++, message, ...opts });
  else opts?.onExpire?.(); // no host mounted — behave like a timeout
}

export function ToastHost({ bottomOffset }: { bottomOffset: number }) {
  const reduce = useReducedMotion();
  const [toast, setToast] = useState<ToastData | null>(null);
  // Ref mirrors state so expiry can be settled synchronously (no double-fire).
  const current = useRef<ToastData | null>(null);

  useEffect(() => {
    push = (t) => {
      current.current?.onExpire?.(); // replaced counts as expired
      current.current = t;
      setToast(t);
    };
    return () => {
      push = null;
      current.current?.onExpire?.();
      current.current = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      if (current.current?.id !== toast.id) return;
      current.current = null;
      setToast(null);
      toast.onExpire?.();
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function act() {
    const t = current.current;
    if (!t) return;
    current.current = null;
    setToast(null);
    t.onAction?.();
  }

  if (!toast) return null;
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.duration(130)}
      exiting={reduce ? undefined : FadeOutDown.duration(130)}
      pointerEvents="box-none"
      style={{ position: "absolute", left: 20, right: 20, bottom: bottomOffset }}
    >
      <View
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-3 rounded-full bg-foreground px-5 py-3.5"
      >
        <Text numberOfLines={1} className="flex-1 font-bold text-background">
          {toast.message}
        </Text>
        {toast.actionLabel ? (
          <Pressable accessibilityRole="button" hitSlop={12} onPress={act} className="active:opacity-60">
            <Text className="text-xs font-black uppercase tracking-[2px] text-background">{toast.actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
