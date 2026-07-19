import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { scalePortion, type DraftItem } from "@loggi/shared";
import { useColors } from "../lib/colors";
import { Card, Input, Button } from "./ui";

const round1 = (n: number) => Math.round(n * 10) / 10;
const scaleOpt = (v: number | null | undefined, factor: number) => (v == null ? v : round1(v * factor));

export function scaleDraftItem(item: DraftItem, factor: number): DraftItem {
  return {
    ...item,
    portion: scalePortion(item.portion, factor),
    calories: Math.round(item.calories * factor),
    protein_g: round1(item.protein_g * factor),
    carbs_g: round1(item.carbs_g * factor),
    fat_g: round1(item.fat_g * factor),
    sat_fat_g: scaleOpt(item.sat_fat_g, factor),
    fiber_g: scaleOpt(item.fiber_g, factor),
    sugar_g: scaleOpt(item.sugar_g, factor),
    sodium_mg: scaleOpt(item.sodium_mg, factor),
  };
}

const macroFields = [
  { key: "calories", label: "cal" },
  { key: "protein_g", label: "P (g)" },
  { key: "carbs_g", label: "C (g)" },
  { key: "fat_g", label: "F (g)" },
] as const;

interface Props {
  name: string;
  onNameChange: (name: string) => void;
  items: DraftItem[];
  onItemsChange: (items: DraftItem[]) => void;
}

export function MealReview({ name, onNameChange, items, onItemsChange }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const colors = useColors();

  // Touching portion or any number counts as the human checking the AI's guess,
  // so the low-confidence flag clears; renaming alone doesn't.
  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    const checked = Object.keys(patch).some((k) => k !== "name");
    onItemsChange(items.map((it, i) => (i === index ? { ...it, ...patch, ...(checked && { confidence: null }) } : it)));
  };
  const scale = (index: number, factor: number) =>
    onItemsChange(items.map((it, i) => (i === index ? { ...scaleDraftItem(it, factor), confidence: null } : it)));

  return (
    <Card className="p-4">
      <Input
        value={name}
        onChangeText={onNameChange}
        className="mb-2 border-0 bg-transparent px-0 text-center text-base font-semibold"
        placeholder="Meal name"
      />
      {items.map((item, index) => {
        const isOpen = open === index;
        return (
          <View key={index} className="border-b border-border">
            <Pressable
              onPress={() => setOpen(isOpen ? null : index)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              className="flex-row items-center gap-3 py-3"
            >
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-1">
                  <Text className="font-semibold text-foreground">{item.name || "Untitled item"}</Text>
                  {item.usda_match ? <Feather name="check-circle" size={13} color={colors.foreground} /> : null}
                </View>
                {item.portion ? (
                  <View className="flex-row items-center gap-1">
                    {item.confidence === "low" ? <Feather name="help-circle" size={12} color="#d97706" /> : null}
                    <Text className={`text-xs ${item.confidence === "low" ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>
                      {item.portion}
                    </Text>
                  </View>
                ) : null}
                <Text className="text-muted-foreground text-xs tabular-nums">
                  P {round1(item.protein_g)} · C {round1(item.carbs_g)} · F {round1(item.fat_g)}
                </Text>
              </View>
              <Text className="font-bold tabular-nums text-foreground">
                {item.calories}
                <Text className="text-muted-foreground text-xs font-medium"> cal</Text>
              </Text>
              <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </Pressable>

            {isOpen ? (
              <View className="gap-2 pb-3">
                <View className="flex-row items-center gap-2">
                  <Input value={item.name} onChangeText={(v) => updateItem(index, { name: v })} className="flex-1" />
                  <Button
                    variant="ghost"
                    size="icon"
                    accessibilityLabel="Remove item"
                    onPress={() => onItemsChange(items.filter((_, i) => i !== index))}
                  >
                    <Feather name="trash-2" size={18} color={colors.foreground} />
                  </Button>
                </View>
                <View className="flex-row items-center gap-2">
                  <Input value={item.portion} onChangeText={(v) => updateItem(index, { portion: v })} className="flex-1" />
                  <Button variant="outline" size="sm" className="min-h-11" accessibilityLabel="Halve portion" onPress={() => scale(index, 0.5)}>×½</Button>
                  <Button variant="outline" size="sm" className="min-h-11" accessibilityLabel="Double portion" onPress={() => scale(index, 2)}>×2</Button>
                </View>
                <View className="flex-row gap-2">
                  {macroFields.map(({ key, label }) => (
                    <View key={key} className="flex-1 gap-1">
                      <Text className="text-muted-foreground text-xs">{label}</Text>
                      <Input
                        keyboardType="decimal-pad"
                        value={String(item[key])}
                        onChangeText={(v) =>
                          updateItem(index, {
                            [key]: key === "calories" ? Math.max(0, Math.round(Number(v) || 0)) : Math.max(0, Number(v) || 0),
                          })
                        }
                        className="min-h-11 px-2 py-2 text-center"
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      <Button
        variant="outline"
        className="mt-3"
        onPress={() => {
          onItemsChange([...items, { name: "", portion: "", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }]);
          setOpen(items.length);
        }}
      >
        <Feather name="plus" size={16} color={colors.foreground} />
        <Text className="font-bold text-foreground">Add item</Text>
      </Button>
    </Card>
  );
}
