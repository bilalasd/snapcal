import { useState } from "react";
import { View, Text, Alert as RNAlert } from "react-native";
import { fetchJson } from "../lib/api";
import { tapSuccess } from "../lib/haptics";
import { Sheet } from "./sheet";
import { Button, Field, Input, Spinner } from "./ui";

const KG_PER_LB = 0.453592;

export function LogWeightDrawer({
  open,
  onClose,
  imperial,
  onLogged,
}: {
  open: boolean;
  onClose: () => void;
  imperial: boolean;
  onLogged: () => void;
}) {
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const unit = imperial ? "lb" : "kg";

  async function save() {
    const value = Number(weight);
    if (!value || value <= 0) return RNAlert.alert("Enter a valid weight");
    const weightKg = imperial ? value * KG_PER_LB : value;
    setSaving(true);
    try {
      await fetchJson("/api/weights", {
        method: "POST",
        body: JSON.stringify({ weight_kg: Math.round(weightKg * 100) / 100, date }),
      });
      tapSuccess();
      setWeight("");
      onClose();
      onLogged();
    } catch (err) {
      RNAlert.alert(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <View className="gap-4 px-4">
        <View>
          <Text className="text-xl font-black tracking-tight text-foreground">Log your weight</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Weigh in at the same time each day (first thing in the morning is best) for the smoothest trend.
          </Text>
        </View>
        <Field label={`Weight (${unit})`}>
          <Input keyboardType="decimal-pad" autoFocus placeholder={imperial ? "e.g. 176.4" : "e.g. 80.1"} value={weight} onChangeText={setWeight} />
        </Field>
        <Field label="Date">
          <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        </Field>
        <Button onPress={save} disabled={saving}>
          {saving ? <Spinner /> : <Text className="text-base font-bold text-white">Save</Text>}
        </Button>
      </View>
    </Sheet>
  );
}
