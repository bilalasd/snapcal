import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Switch, Alert as RNAlert, Linking, Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAuth, useUser } from "@clerk/clerk-expo";
import {
  ACTIVITY_LEVELS,
  gramsFromPercents,
  macroPercents,
  type ActivityLevel,
  type Goals,
} from "@loggi/shared";
import { fetchJson } from "../../lib/api";
import { getCachedGoals, setCachedGoals } from "../../lib/cache";
import {
  appleHealthSupported,
  connectAppleHealth,
  disconnectAppleHealth,
  isAppleHealthEnabled,
} from "../../lib/apple-health";
import { useColors } from "../../lib/colors";
import { Card, Button, Input, Field, Kicker, Skeleton, Spinner, Alert } from "../../components/ui";

const KG_PER_LB = 0.453592;
const CM_PER_IN = 2.54;
const SUPPORT_EMAIL = "bilal2206@gmail.com";

const round2 = (n: number) => Math.round(n * 100) / 100;
// decimal-pad yields "," in some locales; Number("0,5") is NaN
const num = (s: string) => Number(s.replace(",", "."));

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
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.value }}
          onPress={() => onChange(o.value)}
          className={`min-h-11 justify-center rounded-xl border px-3 py-2 active:opacity-70 ${value === o.value ? "border-transparent bg-primary" : "border-border bg-card"}`}
        >
          <Text className={`text-sm font-bold ${value === o.value ? "text-white" : "text-foreground"}`}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Save button that shows its own progress and a brief "Saved ✓" instead of an alert. */
function SaveButton({ label, disabled, onSave }: { label: string; disabled?: boolean; onSave: () => Promise<boolean> }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  return (
    <Button
      disabled={disabled || state === "saving"}
      onPress={async () => {
        setState("saving");
        const ok = await onSave();
        setState(ok ? "saved" : "idle");
        if (ok) setTimeout(() => setState("idle"), 1500);
      }}
    >
      {state === "saving" ? (
        <Spinner color="#fff" />
      ) : (
        <Text className="text-base font-bold text-white">{state === "saved" ? "Saved ✓" : label}</Text>
      )}
    </Button>
  );
}

export default function Settings() {
  const colors = useColors();
  const { signOut } = useAuth();
  const { user } = useUser();
  // `goals` only ever holds the last *saved* server state; cards keep their own
  // drafts so editing one card can't leak unsaved changes into another's save.
  const [goals, setGoals] = useState<Goals | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const data = await fetchJson("/api/account/export");
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === "ios") {
        const uri = `${FileSystem.cacheDirectory}loggi-export.json`;
        await FileSystem.writeAsStringAsync(uri, json);
        await Share.share({ url: uri });
      } else {
        // ponytail: Android's Share can't take a file url — raw JSON is fine
        await Share.share({ message: json });
      }
    } catch (err) {
      RNAlert.alert("Export failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function load() {
    setLoadError(false);
    const cached = getCachedGoals();
    if (cached) return setGoals(cached); // PUTs below keep the cache current
    fetchJson<Goals>("/api/goals")
      .then((g) => {
        setGoals(g);
        setCachedGoals(g);
      })
      .catch(() => setLoadError(true));
  }
  useEffect(load, []);

  async function put(next: Goals): Promise<boolean> {
    try {
      const saved = await fetchJson<Goals>("/api/goals", { method: "PUT", body: JSON.stringify(next) });
      setGoals(saved);
      setCachedGoals(saved);
      return true;
    } catch (err) {
      RNAlert.alert("Save failed", err instanceof Error ? err.message : "Please try again.");
      return false;
    }
  }

  function confirmDeleteAccount() {
    RNAlert.alert(
      "Delete account?",
      "This permanently erases your meals, weights, goals, and profile. It cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await fetchJson("/api/account", { method: "DELETE" });
              await signOut();
            } catch (err) {
              RNAlert.alert("Delete failed", err instanceof Error ? err.message : "Please try again.");
            }
          },
        },
      ],
    );
  }

  if (!goals) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="p-5 gap-5">
          <Text className="text-4xl font-black tracking-tighter text-foreground">Settings</Text>
          {loadError ? (
            <View className="gap-3">
              <Alert icon="wifi-off" title="Couldn't load your settings" variant="destructive">
                Check your connection and try again.
              </Alert>
              <Button variant="outline" onPress={load}>Retry</Button>
            </View>
          ) : (
            <Skeleton className="h-72 w-full rounded-3xl" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const imperial = goals.unit_system === "imperial";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        contentContainerClassName="p-5 gap-5"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View>
          <Kicker>Control room</Kicker>
          <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Settings</Text>
        </View>

        {/* key: remount unit-dependent drafts when the unit system changes */}
        <GoalCard key={`goal-${goals.unit_system}`} goals={goals} imperial={imperial} onSave={put} />
        <TargetsCard goals={goals} onSave={put} />

        {/* Adaptive goal — saves instantly; the switch flip is the feedback */}
        <Card className="p-4 gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 flex-row items-center gap-2">
              <Feather name="trending-down" size={16} color={colors.foreground} />
              <Text className="text-2xl font-black tracking-tight text-foreground">Smart calorie goal</Text>
            </View>
            <Switch
              value={goals.adaptive_goal}
              onValueChange={(v) => void put({ ...goals, adaptive_goal: v })}
              trackColor={{ true: colors.foreground }}
              accessibilityLabel="Smart calorie goal"
            />
          </View>
          <Text className="text-sm text-muted-foreground">
            Recalculates your daily calories every Monday from your weight trend — your measured burn rate minus
            what your target rate needs. Falls back to the manual target above until there's enough logging history.
          </Text>
        </Card>

        {/* Units — saves instantly; the selection flip is the feedback */}
        <Card className="p-4 gap-3">
          <View className="flex-row items-center gap-2">
            <Feather name="sliders" size={16} color={colors.foreground} />
            <Text className="text-2xl font-black tracking-tight text-foreground">Units</Text>
          </View>
          <OptionRow
            value={goals.unit_system}
            options={[{ value: "metric", label: "Metric — kg, cm" }, { value: "imperial", label: "Imperial — lb, ft/in" }]}
            onChange={(v) => put({ ...goals, unit_system: v })}
          />
        </Card>

        <ProfileSection key={`profile-${goals.unit_system}`} goals={goals} imperial={imperial} onSave={put} />

        <AppleHealthCard />

        {/* Your data */}
        <Card className="p-4 gap-3">
          <View className="flex-row items-center gap-2">
            <Feather name="shield" size={16} color={colors.foreground} />
            <Text className="text-2xl font-black tracking-tight text-foreground">Your data</Text>
          </View>
          <View>
            <Kicker>Signed in as</Kicker>
            <Text className="mt-1 text-base text-foreground">{user?.primaryEmailAddress?.emailAddress ?? "—"}</Text>
          </View>
          <Text className="text-sm text-muted-foreground">
            Everything you log belongs to you — take a full copy anytime, or erase it all for good.
          </Text>
          <Button variant="outline" onPress={exportData} disabled={exporting}>
            {exporting ? (
              <Spinner />
            ) : (
              <>
                <Feather name="download" size={16} color={colors.foreground} />
                <Text className="font-bold text-foreground">Export my data</Text>
              </>
            )}
          </Button>
          <Button variant="outline" onPress={() => signOut()}>
            <Feather name="log-out" size={16} color={colors.destructive} />
            <Text className="font-bold text-destructive">Log out</Text>
          </Button>
          <Pressable onPress={confirmDeleteAccount} className="items-center py-2 active:opacity-60">
            <Text className="text-sm font-bold text-destructive">Delete account</Text>
          </Pressable>
        </Card>

        <View className="items-center gap-1 pb-2">
          <Text className="text-xs text-muted-foreground">Loggi v{Constants.expoConfig?.version ?? "dev"}</Text>
          <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Loggi feedback`)}>
            <Text className="text-xs font-bold text-muted-foreground underline">Send feedback</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Read weigh-ins from Apple Health. The switch is the whole UI: flipping it on
 *  shows the HealthKit permission sheet and runs the first sync. */
function AppleHealthCard() {
  const colors = useColors();
  const supported = appleHealthSupported(); // false in Expo Go / on Android
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    isAppleHealthEnabled().then(setOn).catch(() => {});
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const ok = await connectAppleHealth();
        setOn(ok);
        if (!ok) {
          RNAlert.alert(
            "Couldn't connect",
            "Allow Loggi to read Weight in the Health app: Profile → Apps → Loggi.",
          );
        }
      } else {
        await disconnectAppleHealth();
        setOn(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-2">
          <Feather name="heart" size={16} color={colors.foreground} />
          <Text className="text-2xl font-black tracking-tight text-foreground">Apple Health</Text>
        </View>
        <Switch
          value={on}
          disabled={!supported || busy}
          onValueChange={toggle}
          trackColor={{ true: colors.foreground }}
          accessibilityLabel="Apple Health"
        />
      </View>
      <Text className="text-sm text-muted-foreground">
        {supported
          ? "Pulls your weigh-ins from the Health app automatically, so your trend stays current without manual logging."
          : "Available in the installed app — Expo Go can't access Apple Health."}
      </Text>
    </Card>
  );
}

function GoalCard({ goals, imperial, onSave }: { goals: Goals; imperial: boolean; onSave: (g: Goals) => Promise<boolean> }) {
  const colors = useColors();
  const unit = imperial ? "lb" : "kg";
  const toDisplay = (kg: number) => (imperial ? kg / KG_PER_LB : kg);
  const toKg = (display: number) => (imperial ? display * KG_PER_LB : display);

  const savedRate = goals.target_rate_kg_per_wk;
  const [direction, setDirection] = useState<"lose" | "maintain" | "gain">(
    savedRate < 0 ? "lose" : savedRate > 0 ? "gain" : "maintain",
  );
  // Drafts are raw strings so typing "0.5" isn't mangled by a parse round-trip.
  const [rate, setRate] = useState(savedRate === 0 ? "0.5" : String(round2(Math.abs(toDisplay(savedRate)))));
  const [goalWeight, setGoalWeight] = useState(
    goals.goal_weight_kg == null ? "" : String(Math.round(toDisplay(goals.goal_weight_kg) * 10) / 10),
  );

  function save() {
    const mag = Math.abs(num(rate)) || 0;
    const displayVal = direction === "maintain" ? 0 : direction === "lose" ? -mag : mag;
    const w = num(goalWeight);
    return onSave({
      ...goals,
      target_rate_kg_per_wk: round2(toKg(displayVal)),
      goal_weight_kg: goalWeight.trim() === "" || !(w > 0) ? null : round2(toKg(w)),
    });
  }

  return (
    <Card className="border-transparent bg-block-cream p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <Feather name="target" size={16} color={colors.foreground} />
        <Text className="text-2xl font-black tracking-tight text-foreground">Your goal</Text>
      </View>
      <Field label="Direction">
        <OptionRow
          value={direction}
          options={[{ value: "lose", label: "Lose" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Gain" }]}
          onChange={setDirection}
        />
      </Field>
      {direction !== "maintain" ? (
        <Field label={`Rate (${unit}/week)`}>
          <Input keyboardType="decimal-pad" value={rate} onChangeText={setRate} />
        </Field>
      ) : null}
      <Field label={`Goal weight (${unit}, optional)`}>
        <Input keyboardType="decimal-pad" placeholder="Target to reach" value={goalWeight} onChangeText={setGoalWeight} />
      </Field>
      <SaveButton label="Save goal" onSave={save} />
    </Card>
  );
}

function TargetsCard({ goals, onSave }: { goals: Goals; onSave: (g: Goals) => Promise<boolean> }) {
  const saved = macroPercents(goals.daily_calories, {
    protein_g: goals.daily_protein_g,
    carbs_g: goals.daily_carbs_g,
    fat_g: goals.daily_fat_g,
  });
  const [calories, setCalories] = useState(String(goals.daily_calories));
  const [pcts, setPcts] = useState({
    protein_pct: String(saved.protein_pct),
    carbs_pct: String(saved.carbs_pct),
    fat_pct: String(saved.fat_pct),
  });

  const cal = Math.round(Number(calories)) || 0;
  const nums = {
    protein_pct: Number(pcts.protein_pct) || 0,
    carbs_pct: Number(pcts.carbs_pct) || 0,
    fat_pct: Number(pcts.fat_pct) || 0,
  };
  const total = nums.protein_pct + nums.carbs_pct + nums.fat_pct;
  const grams = gramsFromPercents(cal, nums);
  const valid = total === 100 && cal >= 500;

  function save() {
    return onSave({
      ...goals,
      daily_calories: cal,
      daily_protein_g: grams.protein_g,
      daily_carbs_g: grams.carbs_g,
      daily_fat_g: grams.fat_g,
    });
  }

  return (
    <Card className="p-4 gap-3">
      <Text className="text-2xl font-black tracking-tight text-foreground">Daily targets</Text>
      <Field label="Calories (cal)">
        <Input keyboardType="number-pad" value={calories} onChangeText={setCalories} />
      </Field>
      <View className="flex-row gap-3">
        {([["protein_pct", "Protein %"], ["carbs_pct", "Carbs %"], ["fat_pct", "Fat %"]] as const).map(([key, label]) => (
          <View key={key} className="flex-1">
            <Field label={label}>
              <Input
                keyboardType="number-pad"
                value={pcts[key]}
                onChangeText={(v) => setPcts((p) => ({ ...p, [key]: v }))}
                className="text-center"
              />
            </Field>
          </View>
        ))}
      </View>
      <Text className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
        {total !== 100
          ? `Percentages add up to ${total}% — they need to total 100%.`
          : cal < 500
            ? "Calories must be at least 500."
            : `= ${grams.protein_g}g protein · ${grams.carbs_g}g carbs · ${grams.fat_g}g fat`}
      </Text>
      <SaveButton label="Save targets" onSave={save} disabled={!valid} />
    </Card>
  );
}

function ProfileSection({ goals, imperial, onSave }: { goals: Goals; imperial: boolean; onSave: (g: Goals) => Promise<boolean> }) {
  const colors = useColors();
  const [sex, setSex] = useState<string>(goals.sex ?? "");
  const [age, setAge] = useState(goals.age ? String(goals.age) : "");
  const [activity, setActivity] = useState<ActivityLevel | "">(goals.activity_level ?? "");
  const [heightCm, setHeightCm] = useState(goals.height_cm ? String(Math.round(goals.height_cm)) : "");
  const [heightFt, setHeightFt] = useState(goals.height_cm ? String(Math.floor(goals.height_cm / CM_PER_IN / 12)) : "");
  const [heightIn, setHeightIn] = useState(goals.height_cm ? String(Math.round((goals.height_cm / CM_PER_IN) % 12)) : "");

  function save() {
    const cm = imperial ? (Number(heightFt || 0) * 12 + Number(heightIn || 0)) * CM_PER_IN : Number(heightCm || 0);
    return onSave({
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
        <Feather name="user" size={16} color={colors.foreground} />
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
              accessibilityRole="button"
              accessibilityState={{ selected: activity === level.value }}
              onPress={() => setActivity(level.value)}
              className={`rounded-xl border p-3 active:opacity-70 ${activity === level.value ? "border-transparent bg-primary" : "border-border bg-card"}`}
            >
              <Text className={`font-bold ${activity === level.value ? "text-white" : "text-foreground"}`}>{level.label}</Text>
              <Text className={`text-xs ${activity === level.value ? "text-white/70" : "text-muted-foreground"}`}>{level.description}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <SaveButton label="Save profile" onSave={save} />
    </Card>
  );
}
