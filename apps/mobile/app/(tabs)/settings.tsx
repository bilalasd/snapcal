import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert as RNAlert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth, useUser } from "@clerk/clerk-expo";
import {
  ACTIVITY_LEVELS,
  gramsFromPercents,
  macroPercents,
  type ActivityLevel,
  type Goals,
} from "@mealio/shared";
import { fetchJson } from "../../lib/api";
import { Card, Button, Input, Field, Kicker, Skeleton, Spinner } from "../../components/ui";

const KG_PER_LB = 0.453592;
const CM_PER_IN = 2.54;

function OptionRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          className={`rounded-xl border px-3 py-2 ${value === o.value ? "border-transparent bg-primary" : "border-border bg-card"}`}
        >
          <Text className={`text-sm font-bold ${value === o.value ? "text-white" : "text-foreground"}`}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function Settings() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const [goals, setGoals] = useState<Goals | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJson<Goals>("/api/goals").then(setGoals).catch(() => {});
  }, []);

  const update = (patch: Partial<Goals>) => setGoals((g) => (g ? { ...g, ...patch } : g));

  async function put(next: Goals, okMsg?: string) {
    setSaving(true);
    try {
      const saved = await fetchJson<Goals>("/api/goals", { method: "PUT", body: JSON.stringify(next) });
      setGoals(saved);
      if (okMsg) RNAlert.alert(okMsg);
    } catch (err) {
      RNAlert.alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!goals) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="p-5 gap-5">
          <Text className="text-4xl font-black tracking-tighter text-foreground">Settings</Text>
          <Skeleton className="h-72 w-full rounded-3xl" />
        </View>
      </SafeAreaView>
    );
  }

  const imperial = goals.unit_system === "imperial";
  const unit = imperial ? "lb" : "kg";
  const pcts = macroPercents(goals.daily_calories, { protein_g: goals.daily_protein_g, carbs_g: goals.daily_carbs_g, fat_g: goals.daily_fat_g });
  const pctTotal = pcts.protein_pct + pcts.carbs_pct + pcts.fat_pct;

  function updatePct(key: keyof typeof pcts, value: number) {
    const next = { ...pcts, [key]: Math.max(0, Math.min(100, value)) };
    const grams = gramsFromPercents(goals!.daily_calories, next);
    update({ daily_protein_g: grams.protein_g, daily_carbs_g: grams.carbs_g, daily_fat_g: grams.fat_g });
  }

  const direction: "lose" | "maintain" | "gain" =
    goals.target_rate_kg_per_wk < 0 ? "lose" : goals.target_rate_kg_per_wk > 0 ? "gain" : "maintain";
  const displayRate = Math.round(Math.abs(imperial ? goals.target_rate_kg_per_wk / KG_PER_LB : goals.target_rate_kg_per_wk) * 100) / 100;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="p-5 gap-5">
        <View>
          <Kicker>Control room</Kicker>
          <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Settings</Text>
        </View>

        {/* Goal */}
        <Card className="border-transparent bg-block-cream p-4 gap-3">
          <View className="flex-row items-center gap-2">
            <Feather name="target" size={16} color="#000" />
            <Text className="text-2xl font-black tracking-tight text-foreground">Your goal</Text>
          </View>
          <Field label="Direction">
            <OptionRow
              value={direction}
              options={[{ value: "lose", label: "Lose" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Gain" }]}
              onChange={(d) => {
                const mag = displayRate || 0.5;
                const displayVal = d === "maintain" ? 0 : d === "lose" ? -mag : mag;
                update({ target_rate_kg_per_wk: Math.round((imperial ? displayVal * KG_PER_LB : displayVal) * 100) / 100 });
              }}
            />
          </Field>
          {direction !== "maintain" ? (
            <Field label={`Rate (${unit}/week)`}>
              <Input
                keyboardType="decimal-pad"
                value={String(displayRate)}
                onChangeText={(v) => {
                  const mag = Math.abs(Number(v) || 0);
                  const displayVal = direction === "lose" ? -mag : mag;
                  update({ target_rate_kg_per_wk: Math.round((imperial ? displayVal * KG_PER_LB : displayVal) * 100) / 100 });
                }}
              />
            </Field>
          ) : null}
          <Field label={`Goal weight (${unit}, optional)`}>
            <Input
              keyboardType="decimal-pad"
              placeholder="Target to reach"
              value={goals.goal_weight_kg == null ? "" : String(Math.round((imperial ? goals.goal_weight_kg / KG_PER_LB : goals.goal_weight_kg) * 10) / 10)}
              onChangeText={(v) => {
                const n = Number(v);
                update({ goal_weight_kg: v.trim() === "" || n <= 0 ? null : Math.round((imperial ? n * KG_PER_LB : n) * 100) / 100 });
              }}
            />
          </Field>
          <Button onPress={() => put(goals, "Goal saved")} disabled={saving}>
            {saving ? <Spinner /> : <Text className="text-base font-bold text-white">Save goal</Text>}
          </Button>
        </Card>

        {/* Daily targets */}
        <Card className="p-4 gap-3">
          <Text className="text-2xl font-black tracking-tight text-foreground">Daily targets</Text>
          <Field label="Calories (cal)">
            <Input
              keyboardType="number-pad"
              value={String(goals.daily_calories)}
              onChangeText={(v) => {
                const calories = Number(v) || 0;
                const grams = gramsFromPercents(calories, pcts);
                update({ daily_calories: calories, daily_protein_g: grams.protein_g, daily_carbs_g: grams.carbs_g, daily_fat_g: grams.fat_g });
              }}
            />
          </Field>
          <View className="flex-row gap-3">
            {([["protein_pct", "Protein %"], ["carbs_pct", "Carbs %"], ["fat_pct", "Fat %"]] as const).map(([key, label]) => (
              <View key={key} className="flex-1">
                <Field label={label}>
                  <Input keyboardType="number-pad" value={String(pcts[key])} onChangeText={(v) => updatePct(key, Number(v) || 0)} className="text-center" />
                </Field>
              </View>
            ))}
          </View>
          <Text className={`text-xs ${pctTotal === 100 ? "text-muted-foreground" : "text-destructive"}`}>
            {pctTotal === 100
              ? `= ${goals.daily_protein_g}g protein · ${goals.daily_carbs_g}g carbs · ${goals.daily_fat_g}g fat`
              : `Percentages add up to ${pctTotal}% — they need to total 100%.`}
          </Text>
          <Button onPress={() => put(goals, "Targets saved")} disabled={saving || pctTotal !== 100}>
            {saving ? <Spinner /> : <Text className="text-base font-bold text-white">Save targets</Text>}
          </Button>
        </Card>

        {/* Units */}
        <Card className="p-4 gap-3">
          <View className="flex-row items-center gap-2">
            <Feather name="sliders" size={16} color="#000" />
            <Text className="text-2xl font-black tracking-tight text-foreground">Units</Text>
          </View>
          <OptionRow
            value={goals.unit_system}
            options={[{ value: "metric", label: "Metric — kg, cm" }, { value: "imperial", label: "Imperial — lb, ft/in" }]}
            onChange={(v) => put({ ...goals, unit_system: v }, "Units updated")}
          />
        </Card>

        {/* Profile */}
        <ProfileSection goals={goals} imperial={imperial} onSave={(next) => put(next, "Profile saved")} saving={saving} />

        {/* Account */}
        <Card className="p-4 gap-2">
          <Kicker>Signed in as</Kicker>
          <Text className="text-base text-foreground">{user?.primaryEmailAddress?.emailAddress ?? "—"}</Text>
        </Card>

        <Button variant="outline" onPress={() => signOut()}>
          <Feather name="log-out" size={16} color="#d92d20" />
          <Text className="font-bold text-destructive">Log out</Text>
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileSection({ goals, imperial, onSave, saving }: { goals: Goals; imperial: boolean; onSave: (g: Goals) => void; saving: boolean }) {
  const [sex, setSex] = useState<string>(goals.sex ?? "");
  const [age, setAge] = useState(goals.age ? String(goals.age) : "");
  const [activity, setActivity] = useState<ActivityLevel | "">(goals.activity_level ?? "");
  const [heightCm, setHeightCm] = useState(goals.height_cm ? String(Math.round(goals.height_cm)) : "");
  const [heightFt, setHeightFt] = useState(goals.height_cm ? String(Math.floor(goals.height_cm / CM_PER_IN / 12)) : "");
  const [heightIn, setHeightIn] = useState(goals.height_cm ? String(Math.round((goals.height_cm / CM_PER_IN) % 12)) : "");

  function save() {
    const cm = imperial ? (Number(heightFt || 0) * 12 + Number(heightIn || 0)) * CM_PER_IN : Number(heightCm || 0);
    onSave({
      ...goals,
      sex: (sex || null) as Goals["sex"],
      age: age ? Number(age) : null,
      height_cm: cm > 0 ? Math.round(cm * 10) / 10 : null,
      activity_level: (activity || null) as Goals["activity_level"],
    });
  }

  return (
    <Card className="p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <Feather name="user" size={16} color="#000" />
        <Text className="text-2xl font-black tracking-tight text-foreground">Your profile</Text>
      </View>
      <Text className="text-sm text-muted-foreground">Used to estimate how many calories you burn.</Text>

      <Field label="Sex">
        <OptionRow value={sex} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} onChange={setSex} />
      </Field>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field label="Age">
            <Input keyboardType="number-pad" value={age} onChangeText={setAge} />
          </Field>
        </View>
        <View className="flex-1">
          {imperial ? (
            <Field label="Height (ft / in)">
              <View className="flex-row gap-2">
                <Input keyboardType="number-pad" placeholder="ft" value={heightFt} onChangeText={setHeightFt} className="flex-1" />
                <Input keyboardType="number-pad" placeholder="in" value={heightIn} onChangeText={setHeightIn} className="flex-1" />
              </View>
            </Field>
          ) : (
            <Field label="Height (cm)">
              <Input keyboardType="number-pad" value={heightCm} onChangeText={setHeightCm} />
            </Field>
          )}
        </View>
      </View>
      <Field label="Activity level">
        <View className="gap-2">
          {ACTIVITY_LEVELS.map((level) => (
            <Pressable
              key={level.value}
              onPress={() => setActivity(level.value)}
              className={`rounded-xl border p-3 ${activity === level.value ? "border-transparent bg-primary" : "border-border bg-card"}`}
            >
              <Text className={`font-bold ${activity === level.value ? "text-white" : "text-foreground"}`}>{level.label}</Text>
              <Text className={`text-xs ${activity === level.value ? "text-white/70" : "text-muted-foreground"}`}>{level.description}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <Button onPress={save} disabled={saving}>
        {saving ? <Spinner /> : <Text className="text-base font-bold text-white">Save profile</Text>}
      </Button>
    </Card>
  );
}
