import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { localDateString, mealTotals } from "@loggi/shared";
import { getCachedRange } from "../lib/cache";
import { useColors } from "../lib/colors";
import { Sheet } from "./sheet";

// Jump straight to a day instead of swiping one at a time. Shows each day's
// logged calories from the 30-day range cache so the list doubles as a map.
// ponytail: 30 days back — matches the range cache; swipe still reaches further.

const DAYS = 30;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

export function DayPickerSheet({
  open,
  onClose,
  value,
  today,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const colors = useColors();

  const sums = useMemo(() => {
    const map = new Map<string, number>();
    if (!open) return map;
    for (const m of getCachedRange() ?? []) {
      if (m.planned) continue;
      const d = localDateString(new Date(m.eatenAt));
      map.set(d, (map.get(d) ?? 0) + mealTotals(m).calories);
    }
    return map;
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose}>
      <View className="px-4">
        <Text className="mb-2 text-center text-xl font-black tracking-tight text-foreground">Jump to a day</Text>
        <ScrollView className="max-h-[55vh]">
          {Array.from({ length: DAYS }, (_, i) => {
            const date = addDays(today, -i);
            const label =
              i === 0
                ? "Today"
                : i === 1
                  ? "Yesterday"
                  : new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
            const cal = sums.get(date);
            const isSelected = date === value;
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onSelect(date);
                  onClose();
                }}
                className={`min-h-11 flex-row items-center justify-between rounded-xl px-3 active:opacity-60 ${isSelected ? "bg-muted" : ""}`}
              >
                <View className="flex-row items-center gap-2">
                  <Text className={`text-base ${isSelected ? "font-black" : "font-semibold"} text-foreground`}>{label}</Text>
                  {isSelected ? <Feather name="check" size={14} color={colors.foreground} /> : null}
                </View>
                <Text className="text-sm font-bold tabular-nums text-muted-foreground">
                  {cal != null ? `${cal.toLocaleString()} cal` : "—"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Sheet>
  );
}
