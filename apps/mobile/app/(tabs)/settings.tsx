import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Switch, Alert as RNAlert, Linking, Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAuth, useUser } from "@clerk/clerk-expo";
import {
  ACTIVITY_LEVELS,
  bmrMifflinStJeor,
  deficitForRate,
  estimatedTdee,
  gramsFromPercents,
  localDateString,
  macroPercents,
  mealsCsv,
  tzOffsetMinutes,
  type ActivityLevel,
  type ApiMeal,
  type Goals,
} from "@loggi/shared";
import { fetchJson } from "../../lib/api";
import { getCachedGoals, setCachedGoals, hasLoggedToday } from "../../lib/cache";
import {
  appleHealthSupported,
  connectAppleHealth,
  disconnectAppleHealth,
  isAppleHealthEnabled,
  lastAppleHealthSync,
  syncAppleHealth,
} from "../../lib/apple-health";
import { disableMondayNote, enableMondayNote, getMondayNotePref } from "../../lib/monday-note";
import { disableEveningReminder, enableEveningReminder, getEveningReminderPref } from "../../lib/reminder";
import { useColors, block } from "../../lib/colors";
import { Card, Button, Input, Field, Kicker, Skeleton, Spinner, Alert, SegmentedToggle } from "../../components/ui";

const KG_PER_LB = 0.453592;
const CM_PER_IN = 2.54;
const SUPPORT_EMAIL = "bilal2206@gmail.com";

const round2 = (n: number) => Math.round(n * 100) / 100;
// decimal-pad yields "," in some locales; Number("0,5") is NaN
const num = (s: string) => Number(s.replace(",", "."));

/** Adaptive-goal + current-weight context pulled from /api/trends. */
type TrendsLite = { adaptiveKcal: number | null; currentKg: number | null };

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
          <Text className={`text-sm font-bold ${value === o.value ? "text-primary-foreground" : "text-foreground"}`}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Save button that shows its own progress and a brief "Saved ✓" instead of an alert. */
function SaveButton({ label, disabled, onSave }: { label: string; disabled?: boolean; onSave: () => Promise<boolean> }) {
  const colors = useColors();
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
        // primary-foreground === the background token, so it reads on bg-primary in both themes
        <Spinner color={colors.background} />
      ) : (
        <Text className="text-base font-bold text-primary-foreground">{state === "saved" ? "Saved ✓" : label}</Text>
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
  // Context for the smart-goal status, "current weight" hints, and estimated
  // burn. Loads in the background; every consumer degrades to nothing on null.
  const [trends, setTrends] = useState<TrendsLite | null>(null);

  useEffect(() => {
    fetchJson<{ adaptive_goal_kcal: number | null; weights: { trendKg: number }[] }>(
      `/api/trends?days=90&tz_offset=${tzOffsetMinutes()}`,
    )
      .then((t) => setTrends({ adaptiveKcal: t.adaptive_goal_kcal, currentKg: t.weights.at(-1)?.trendKg ?? null }))
      .catch(() => {});
  }, []);

  // Two shapes, one endpoint: full JSON (everything), or a meals CSV for
  // spreadsheets. Both built client-side from GET /api/account.
  async function exportData(format: "json" | "csv") {
    setExporting(true);
    try {
      const data = await fetchJson<{ meals: ApiMeal[] }>("/api/account");
      const body = format === "json" ? JSON.stringify(data, null, 2) : mealsCsv(data.meals);
      if (Platform.OS === "ios") {
        const uri = `${FileSystem.cacheDirectory}loggi-${format === "json" ? "export" : "meals"}-${localDateString()}.${format}`;
        await FileSystem.writeAsStringAsync(uri, body);
        await Share.share({ url: uri });
      } else {
        // ponytail: Android's Share can't take a file url — raw text is fine
        await Share.share({ message: body });
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

  function confirmSignOut() {
    RNAlert.alert("Log out?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", onPress: () => void signOut() },
    ]);
  }

  function confirmDeleteAccount() {
    RNAlert.alert(
      "Delete account?",
      "This permanently erases your meals, weights, goals, and profile. It cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          // ponytail: Alert.prompt is iOS-only — fine, Android isn't a target
          onPress: () =>
            RNAlert.prompt(
              'Type "DELETE" to confirm',
              "Last check — everything goes for good.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete forever",
                  style: "destructive",
                  onPress: async (typed?: string) => {
                    if ((typed ?? "").trim().toUpperCase() !== "DELETE") return;
                    try {
                      await fetchJson("/api/account", { method: "DELETE" });
                      await signOut();
                    } catch (err) {
                      RNAlert.alert("Delete failed", err instanceof Error ? err.message : "Please try again.");
                    }
                  },
                },
              ],
              "plain-text",
            ),
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
        contentContainerClassName="p-5 pb-28 gap-5"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <View>
          <Kicker>Control room</Kicker>
          <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">Settings</Text>
        </View>

        <GoalCard goals={goals} imperial={imperial} currentKg={trends?.currentKg ?? null} onSave={put} />
        <TargetsCard goals={goals} adaptiveKcal={trends?.adaptiveKcal ?? null} onSave={put} />

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
          {goals.adaptive_goal && trends ? (
            <Text className="text-sm font-bold text-foreground">
              {trends.adaptiveKcal != null
                ? `Active — ${trends.adaptiveKcal.toLocaleString()} cal/day right now. Recalculates Monday.`
                : "Collecting data — using your manual target until there's about two weeks of logging."}
            </Text>
          ) : null}
        </Card>

        <MondayNoteSettingsCard />
        <EveningReminderCard />

        {/* Units — saves instantly; the cards convert their drafts in place */}
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

        <ProfileSection goals={goals} imperial={imperial} currentKg={trends?.currentKg ?? null} onSave={put} />

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
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => void exportData("json")} disabled={exporting}>
              {exporting ? (
                <Spinner />
              ) : (
                <>
                  <Feather name="download" size={16} color={colors.foreground} />
                  <Text className="font-bold text-foreground">Export all (JSON)</Text>
                </>
              )}
            </Button>
            <Button variant="outline" className="flex-1" onPress={() => void exportData("csv")} disabled={exporting}>
              <Feather name="grid" size={16} color={colors.foreground} />
              <Text className="font-bold text-foreground">Meals CSV</Text>
            </Button>
          </View>
          {/* Account actions, divided off from the data export above and given
              their own breathing room so the destructive delete never sits
              flush against a routine tap. */}
          <View className="mt-1 gap-4 border-t border-border pt-4">
            <Button variant="outline" onPress={confirmSignOut}>
              <Feather name="log-out" size={16} color={colors.foreground} />
              <Text className="font-bold text-foreground">Log out</Text>
            </Button>
            <Pressable onPress={confirmDeleteAccount} className="items-center py-2 active:opacity-60">
              <Text className="text-sm font-bold text-destructive">Delete account</Text>
            </Pressable>
          </View>
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

/** Bevi's Monday note — a local weekly notification. The switch is the whole UI. */
function MondayNoteSettingsCard() {
  const colors = useColors();
  const [on, setOn] = useState(false);
  useEffect(() => {
    getMondayNotePref().then((p) => setOn(p === "on"));
  }, []);

  async function toggle(v: boolean) {
    setOn(v);
    if (!v) return disableMondayNote();
    const ok = await enableMondayNote();
    if (!ok) {
      setOn(false);
      RNAlert.alert("Notifications are off", "Turn on notifications for Loggi in system Settings first.", [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ]);
    }
  }

  return (
    <Card className="p-4 gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-2">
          <Feather name="bell" size={16} color={colors.foreground} />
          <Text className="text-2xl font-black tracking-tight text-foreground">Monday note</Text>
        </View>
        <Switch
          value={on}
          onValueChange={(v) => void toggle(v)}
          trackColor={{ true: colors.foreground }}
          accessibilityLabel="Monday note notification"
        />
      </View>
      <Text className="text-sm text-muted-foreground">
        A note from Bevi every Monday at 9 — how last week went and what this week's target is. Stays on your
        phone; nothing is sent to you from a server.
      </Text>
    </Card>
  );
}

/** Evening nudge on unlogged days — same switch-is-the-UI shape as above. */
function EveningReminderCard() {
  const colors = useColors();
  const [on, setOn] = useState(false);
  useEffect(() => {
    getEveningReminderPref().then((p) => setOn(p === "on")).catch(() => {});
  }, []);

  async function toggle(v: boolean) {
    setOn(v);
    if (!v) return disableEveningReminder();
    const ok = await enableEveningReminder(hasLoggedToday());
    if (!ok) {
      setOn(false);
      RNAlert.alert("Notifications are off", "Turn on notifications for Loggi in system Settings first.", [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ]);
    }
  }

  return (
    <Card className="p-4 gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-2">
          <Feather name="sunset" size={16} color={colors.foreground} />
          <Text className="text-2xl font-black tracking-tight text-foreground">Evening reminder</Text>
        </View>
        <Switch
          value={on}
          onValueChange={(v) => void toggle(v)}
          trackColor={{ true: colors.foreground }}
          accessibilityLabel="Evening reminder notification"
        />
      </View>
      <Text className="text-sm text-muted-foreground">
        A nudge at 8pm — only on days with nothing logged yet. Log anything and that day's reminder quietly
        skips itself. Stays on your phone.
      </Text>
    </Card>
  );
}

/** Read weigh-ins from Apple Health. The switch is the whole UI: flipping it on
 *  shows the HealthKit permission sheet and runs the first sync. */
function AppleHealthCard() {
  const colors = useColors();
  const supported = appleHealthSupported(); // false in Expo Go / on Android
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  useEffect(() => {
    isAppleHealthEnabled().then(setOn).catch(() => {});
    lastAppleHealthSync().then(setLastSync).catch(() => {});
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const ok = await connectAppleHealth();
        setOn(ok);
        if (ok) setLastSync(await lastAppleHealthSync());
        else {
          RNAlert.alert(
            "Couldn't connect",
            "Allow Loggi to read Weight in the Health app: Profile → Apps → Loggi.",
          );
        }
      } else {
        await disconnectAppleHealth();
        setOn(false);
        setLastSync(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      await syncAppleHealth();
      setLastSync(await lastAppleHealthSync());
    } catch {
      // focus-triggered syncs will retry; nothing actionable here
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
      {supported && on ? (
        <Pressable onPress={syncNow} disabled={busy} className="active:opacity-60">
          <Text className="text-xs font-bold text-muted-foreground underline">
            {busy
              ? "Syncing…"
              : lastSync
                ? `Last synced ${lastSync.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} — tap to sync`
                : "Tap to sync now"}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

function GoalCard({
  goals,
  imperial,
  currentKg,
  onSave,
}: {
  goals: Goals;
  imperial: boolean;
  currentKg: number | null;
  onSave: (g: Goals) => Promise<boolean>;
}) {
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

  // Unit flip: convert the drafts in place — no remount, no lost edits.
  const prevImperial = useRef(imperial);
  useEffect(() => {
    if (prevImperial.current === imperial) return;
    prevImperial.current = imperial;
    const factor = imperial ? 1 / KG_PER_LB : KG_PER_LB;
    setRate((r) => (num(r) > 0 ? String(round2(num(r) * factor)) : r));
    setGoalWeight((w) => (num(w) > 0 ? String(Math.round(num(w) * factor * 10) / 10) : w));
  }, [imperial]);

  const rateKg = toKg(Math.abs(num(rate)) || 0);
  const goalKg = num(goalWeight) > 0 ? toKg(num(goalWeight)) : null;
  const mismatch =
    goalKg != null &&
    currentKg != null &&
    direction !== "maintain" &&
    (direction === "lose" ? goalKg > currentKg : goalKg < currentKg);
  const aggressive = direction !== "maintain" && rateKg > 1.1; // above every preset chip

  // What the rate means: daily deficit/surplus, and roughly when the goal lands.
  let summary: string | null = null;
  if (direction !== "maintain" && rateKg > 0) {
    const cal = Math.abs(deficitForRate(rateKg));
    summary = `≈ ${cal.toLocaleString()} cal/day ${direction === "lose" ? "deficit" : "surplus"}`;
    if (goalKg != null && currentKg != null && !mismatch && goalKg !== currentKg) {
      const eta = new Date(Date.now() + (Math.abs(goalKg - currentKg) / rateKg) * 7 * 86_400_000);
      summary += ` · ${goalWeight} ${unit} around ${eta.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
    }
  }

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
    <Card style={{ backgroundColor: block.cream, borderColor: "transparent" }} className="p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <Feather name="target" size={16} color="#000" />
        <Text className="text-2xl font-black tracking-tight text-black">Your goal</Text>
      </View>
      <Field label="Direction" labelClassName="text-black/60">
        <OptionRow
          value={direction}
          options={[{ value: "lose", label: "Lose" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Gain" }]}
          onChange={setDirection}
        />
      </Field>
      {direction !== "maintain" ? (
        <Field label={`Rate (${unit}/week)`} labelClassName="text-black/60">
          <View className="gap-2">
            <OptionRow
              value={rate}
              options={(imperial ? ["0.5", "1", "1.5", "2"] : ["0.25", "0.5", "0.75", "1"]).map((v) => ({ value: v, label: v }))}
              onChange={setRate}
            />
            <Input keyboardType="decimal-pad" value={rate} onChangeText={setRate} />
          </View>
        </Field>
      ) : null}
      <Field label={`Goal weight (${unit}, optional)`} labelClassName="text-black/60">
        <Input keyboardType="decimal-pad" placeholder="Target to reach" value={goalWeight} onChangeText={setGoalWeight} />
      </Field>
      {mismatch && currentKg != null ? (
        <Text className="text-xs font-bold text-destructive">
          That's {direction === "lose" ? "above" : "below"} your current weight ({Math.round(toDisplay(currentKg) * 10) / 10}{" "}
          {unit}) — check the direction.
        </Text>
      ) : currentKg != null ? (
        <Text className="text-xs text-black/60">
          Current weight: {Math.round(toDisplay(currentKg) * 10) / 10} {unit}
        </Text>
      ) : null}
      {aggressive && summary ? (
        <Text className="text-xs font-bold text-destructive">
          {summary} — that's a lot. Most guidance tops out around {imperial ? "2 lb" : "1 kg"} a week.
        </Text>
      ) : summary ? (
        <Text className="text-xs text-black/60">{summary}</Text>
      ) : null}
      <SaveButton label="Save goal" onSave={save} />
    </Card>
  );
}

const MACRO_PRESETS = [
  { label: "Balanced", protein_pct: 30, carbs_pct: 40, fat_pct: 30 },
  { label: "High protein", protein_pct: 40, carbs_pct: 30, fat_pct: 30 },
  { label: "Low carb", protein_pct: 35, carbs_pct: 25, fat_pct: 40 },
];

function TargetsCard({
  goals,
  adaptiveKcal,
  onSave,
}: {
  goals: Goals;
  adaptiveKcal: number | null;
  onSave: (g: Goals) => Promise<boolean>;
}) {
  const saved = macroPercents(goals.daily_calories, {
    protein_g: goals.daily_protein_g,
    carbs_g: goals.daily_carbs_g,
    fat_g: goals.daily_fat_g,
  });
  const [calories, setCalories] = useState(String(goals.daily_calories));
  const [mode, setMode] = useState<"pct" | "g">("pct");
  const [pcts, setPcts] = useState({
    protein_pct: String(saved.protein_pct),
    carbs_pct: String(saved.carbs_pct),
    fat_pct: String(saved.fat_pct),
  });
  const [grams, setGrams] = useState({
    protein_g: String(goals.daily_protein_g),
    carbs_g: String(goals.daily_carbs_g),
    fat_g: String(goals.daily_fat_g),
  });

  const cal = Math.round(Number(calories)) || 0;
  const pctNums = {
    protein_pct: Number(pcts.protein_pct) || 0,
    carbs_pct: Number(pcts.carbs_pct) || 0,
    fat_pct: Number(pcts.fat_pct) || 0,
  };
  const gramNums = {
    protein_g: Math.round(Number(grams.protein_g)) || 0,
    carbs_g: Math.round(Number(grams.carbs_g)) || 0,
    fat_g: Math.round(Number(grams.fat_g)) || 0,
  };
  const total = pctNums.protein_pct + pctNums.carbs_pct + pctNums.fat_pct;
  const derived = mode === "pct" ? gramsFromPercents(cal, pctNums) : gramNums;
  const macroCal = gramNums.protein_g * 4 + gramNums.carbs_g * 4 + gramNums.fat_g * 9;
  const valid = cal >= 500 && (mode === "g" || total === 100);
  const activePreset =
    MACRO_PRESETS.find(
      (p) => p.protein_pct === pctNums.protein_pct && p.carbs_pct === pctNums.carbs_pct && p.fat_pct === pctNums.fat_pct,
    )?.label ?? "";

  function switchMode(next: "pct" | "g") {
    if (next === mode) return;
    if (next === "g") {
      const g = gramsFromPercents(cal, pctNums);
      setGrams({ protein_g: String(g.protein_g), carbs_g: String(g.carbs_g), fat_g: String(g.fat_g) });
    } else {
      const p = macroPercents(cal, gramNums);
      setPcts({ protein_pct: String(p.protein_pct), carbs_pct: String(p.carbs_pct), fat_pct: String(p.fat_pct) });
    }
    setMode(next);
  }

  function save() {
    return onSave({
      ...goals,
      daily_calories: cal,
      daily_protein_g: derived.protein_g,
      daily_carbs_g: derived.carbs_g,
      daily_fat_g: derived.fat_g,
    });
  }

  return (
    <Card className="p-4 gap-3">
      <Text className="text-2xl font-black tracking-tight text-foreground">Daily targets</Text>
      {goals.adaptive_goal ? (
        <Alert icon="zap" title="Smart goal is managing calories">
          {adaptiveKcal != null
            ? `Currently ${adaptiveKcal.toLocaleString()} cal/day, recalculated every Monday — the numbers below are the fallback.`
            : "It's still collecting data, so the target below applies for now."}
        </Alert>
      ) : null}
      <Field label="Calories (cal)">
        <Input keyboardType="number-pad" value={calories} onChangeText={setCalories} />
      </Field>
      <View className="flex-row items-center justify-between">
        <Kicker>Macros</Kicker>
        <SegmentedToggle
          value={mode}
          options={[{ value: "pct" as const, label: "%" }, { value: "g" as const, label: "grams" }]}
          onChange={switchMode}
        />
      </View>
      {mode === "pct" ? (
        <>
          <OptionRow
            value={activePreset}
            options={MACRO_PRESETS.map((p) => ({ value: p.label, label: p.label }))}
            onChange={(label) => {
              const p = MACRO_PRESETS.find((x) => x.label === label)!;
              setPcts({ protein_pct: String(p.protein_pct), carbs_pct: String(p.carbs_pct), fat_pct: String(p.fat_pct) });
            }}
          />
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
        </>
      ) : (
        <View className="flex-row gap-3">
          {([["protein_g", "Protein g"], ["carbs_g", "Carbs g"], ["fat_g", "Fat g"]] as const).map(([key, label]) => (
            <View key={key} className="flex-1">
              <Field label={label}>
                <Input
                  keyboardType="number-pad"
                  value={grams[key]}
                  onChangeText={(v) => setGrams((g) => ({ ...g, [key]: v }))}
                  className="text-center"
                />
              </Field>
            </View>
          ))}
        </View>
      )}
      <Text className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
        {cal < 500
          ? "Calories must be at least 500."
          : mode === "pct" && total !== 100
            ? `Percentages add up to ${total}% — they need to total 100%.`
            : mode === "pct"
              ? `= ${derived.protein_g}g protein · ${derived.carbs_g}g carbs · ${derived.fat_g}g fat`
              : `Macros add up to ~${macroCal.toLocaleString()} cal${Math.abs(macroCal - cal) > 100 ? ` — your calorie target is ${cal.toLocaleString()}` : ""}`}
      </Text>
      <SaveButton label="Save targets" onSave={save} disabled={!valid} />
    </Card>
  );
}

function ProfileSection({
  goals,
  imperial,
  currentKg,
  onSave,
}: {
  goals: Goals;
  imperial: boolean;
  currentKg: number | null;
  onSave: (g: Goals) => Promise<boolean>;
}) {
  const colors = useColors();
  const [sex, setSex] = useState<string>(goals.sex ?? "");
  const [age, setAge] = useState(goals.age ? String(goals.age) : "");
  const [activity, setActivity] = useState<ActivityLevel | "">(goals.activity_level ?? "");
  const savedTotalIn = goals.height_cm ? Math.round(goals.height_cm / CM_PER_IN) : 0;
  const [heightCm, setHeightCm] = useState(goals.height_cm ? String(Math.round(goals.height_cm)) : "");
  const [heightFt, setHeightFt] = useState(savedTotalIn ? String(Math.floor(savedTotalIn / 12)) : "");
  const [heightIn, setHeightIn] = useState(savedTotalIn ? String(savedTotalIn % 12) : "");

  // Unit flip: convert the height drafts in place — no remount, no lost edits.
  const prevImperial = useRef(imperial);
  useEffect(() => {
    if (prevImperial.current === imperial) return;
    prevImperial.current = imperial;
    if (imperial) {
      const cmVal = Number(heightCm) || 0;
      if (cmVal > 0) {
        const totalIn = Math.round(cmVal / CM_PER_IN);
        setHeightFt(String(Math.floor(totalIn / 12)));
        setHeightIn(String(totalIn % 12));
      }
    } else {
      const cmVal = (Number(heightFt || 0) * 12 + Number(heightIn || 0)) * CM_PER_IN;
      if (cmVal > 0) setHeightCm(String(Math.round(cmVal)));
    }
  }, [imperial]); // eslint-disable-line react-hooks/exhaustive-deps

  const cm = imperial ? (Number(heightFt || 0) * 12 + Number(heightIn || 0)) * CM_PER_IN : Number(heightCm) || 0;
  const ageN = Number(age) || 0;
  const burn =
    (sex === "male" || sex === "female") && ageN > 0 && cm > 0 && activity && currentKg != null
      ? estimatedTdee(bmrMifflinStJeor(sex, currentKg, cm, ageN), activity)
      : null;
  const warn =
    ageN > 0 && (ageN < 13 || ageN > 100)
      ? "Double-check the age — Loggi expects 13–100."
      : imperial && (Number(heightIn) || 0) > 11
        ? "Inches go up to 11 — add the rest to feet."
        : cm > 0 && (cm < 90 || cm > 250)
          ? "Double-check the height — that's outside the human range."
          : null;

  function save() {
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
              <Text className={`font-bold ${activity === level.value ? "text-primary-foreground" : "text-foreground"}`}>{level.label}</Text>
              <Text className={`text-xs ${activity === level.value ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{level.description}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      {warn ? (
        <Text className="text-xs font-bold text-destructive">{warn}</Text>
      ) : burn != null ? (
        <Text className="text-xs text-muted-foreground">Estimated burn: ~{burn.toLocaleString()} cal/day at your current weight.</Text>
      ) : (
        <Text className="text-xs text-muted-foreground">
          Fill everything in{currentKg == null ? " and log a weigh-in" : ""} to see your estimated daily burn.
        </Text>
      )}
      <SaveButton label="Save profile" onSave={save} />
    </Card>
  );
}
