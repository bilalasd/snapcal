import { useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "../lib/colors";
import { Sheet } from "./sheet";

// JS time picker: a sheet of 30-minute slots. No native picker dependency, so
// no dev-client rebuild — and meal times don't need finer than half an hour.

const ROW_H = 44;

export function formatTime(h: number, m: number): string {
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function TimePickerSheet({
  open,
  onClose,
  hour,
  minute,
  capNow = false,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  hour: number;
  minute: number;
  /** Today only: you can't have eaten later than right now. */
  capNow?: boolean;
  onChange: (h: number, m: number) => void;
}) {
  const colors = useColors();
  const ref = useRef<ScrollView>(null);

  const now = new Date();
  const slots: { h: number; m: number }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      if (capNow && (h > now.getHours() || (h === now.getHours() && m > now.getMinutes()))) continue;
      slots.push({ h, m });
    }
  }
  // Highlight the last slot at or before the current value.
  let selected = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].h < hour || (slots[i].h === hour && slots[i].m <= minute)) selected = i;
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <View className="px-4">
        <Text className="mb-2 text-center text-xl font-black tracking-tight text-foreground">Eaten at</Text>
        <ScrollView
          ref={ref}
          style={{ height: 320 }}
          onContentSizeChange={() => ref.current?.scrollTo({ y: Math.max(selected * ROW_H - 130, 0), animated: false })}
        >
          {slots.map((s, i) => (
            <Pressable
              key={`${s.h}:${s.m}`}
              accessibilityRole="button"
              accessibilityState={{ selected: i === selected }}
              onPress={() => {
                onChange(s.h, s.m);
                onClose();
              }}
              style={{ height: ROW_H }}
              className="flex-row items-center justify-between rounded-xl px-3 active:opacity-60"
            >
              <Text className={`text-base ${i === selected ? "font-black" : "font-semibold"} text-foreground`}>
                {formatTime(s.h, s.m)}
              </Text>
              {i === selected ? <Feather name="check" size={16} color={colors.foreground} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Sheet>
  );
}
