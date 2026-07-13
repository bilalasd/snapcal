import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  ACTIVITY_LEVELS,
  macroPercents,
  bmrMifflinStJeor,
  deficitForRate,
  estimatedTdee,
  suggestedIntake,
  suggestedMacros,
  type ActivityLevel,
  type Sex,
  type Goals,
} from "@mealio/shared";
import { fetchJson } from "../lib/api";
import { tapSuccess } from "../lib/haptics";
import { Card, Button, Input, Field, Kicker, Spinner } from "../components/ui";

const KG_PER_LB = 0.453592;
const CM_PER_IN = 2.54;

type Step = "units" | "you" | "body" | "activity" | "goal" | "result";
const STEPS: Step[] = ["units", "you", "body", "activity", "goal", "result"];
type GoalKind = "lose" | "maintain" | "gain";

const KG = { gentle: -0.25, steady: -0.5, ambitious: -0.75, leanGain: 0.125, fastGain: 0.25 };
const LB = { gentle: -0.5 * KG_PER_LB, steady: -1 * KG_PER_LB, ambitious: -1.5 * KG_PER_LB, leanGain: 0.5 * KG_PER_LB, fastGain: 1 * KG_PER_LB };

function ratePresets(imperial: boolean, kind: "lose" | "gain") {
  const v = imperial ? LB : KG;
  const label = (n: number) => (imperial ? `${n} lb/week` : `${n} kg/week`);
  if (kind === "gain") {
    return [
      { rate: v.leanGain, title: `Lean gain · ${label(imperial ? 0.5 : 0.125)}`, blurb: "Slow and mostly muscle. Recommended.", recommended: true },
      { rate: v.fastGain, title: `Faster gain · ${label(imperial ? 1 : 0.25)}`, blurb: "Quicker on the scale, some of it will be fat." },
    ];
  }
  return [
    { rate: v.gentle, title: `Gentle · ${label(imperial ? 0.5 : 0.25)}`, blurb: "Small changes you'll barely notice. Easiest to stick with." },
    { rate: v.steady, title: `Steady · ${label(imperial ? 1 : 0.5)}`, blurb: "The sweet spot for most people. Recommended.", recommended: true },
    { rate: v.ambitious, title: `Ambitious · ${label(imperial ? 1.5 : 0.75)}`, blurb: "Faster results, but you'll feel hungry some days." },
  ];
}

const kgToDisplay = (kg: number, imperial: boolean) => `${Math.round((imperial ? kg / KG_PER_LB : kg) * 100) / 100} ${imperial ? "lb" : "kg"}`;

export default function Onboarding() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goals | null>(null);
  const [step, setStep] = useState<Step>("units");
  const [saving, setSaving] = useState(false);

  const [imperial, setImperial] = useState(false);
  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [goalKind, setGoalKind] = useState<GoalKind | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    fetchJson<Goals>("/api/goals")
      .then((g) => {
        setGoals(g);
        setImperial(g.unit_system === "imperial");
        if (g.sex) setSex(g.sex);
        if (g.age) setAge(String(g.age));
        if (g.height_cm) {
          setHeightCm(String(Math.round(g.height_cm)));
          setHeightFt(String(Math.floor(g.height_cm / CM_PER_IN / 12)));
          setHeightIn(String(Math.round((g.height_cm / CM_PER_IN) % 12)));
        }
        if (g.activity_level) setActivity(g.activity_level);
      })
      .catch(() => {});
    fetchJson<{ weight_kg: number } | null>("/api/weights/latest")
      .then((latest) => latest && setWeight((prev) => prev || String(latest.weight_kg)))
      .catch(() => {});
  }, []);

  const resolvedHeightCm = imperial ? (Number(heightFt || 0) * 12 + Number(heightIn || 0)) * CM_PER_IN : Number(heightCm || 0);
  const weightKg = imperial ? Number(weight || 0) * KG_PER_LB : Number(weight || 0);
  const effectiveRate = goalKind === "maintain" ? 0 : rate ?? 0;
  const bmr = sex && Number(age) >= 10 && resolvedHeightCm >= 80 && weightKg >= 25 ? bmrMifflinStJeor(sex, weightKg, resolvedHeightCm, Number(age)) : null;
  const tdee = bmr !== null && activity ? estimatedTdee(bmr, activity) : null;
  const plan = bmr !== null && tdee !== null ? suggestedIntake(tdee, bmr, effectiveRate) : null;
  const macros = plan !== null ? suggestedMacros(plan.intake, weightKg) : null;
  const splitPcts = plan !== null && macros !== null ? macroPercents(plan.intake, macros) : { protein_pct: 0, carbs_pct: 0, fat_pct: 0 };

  const stepIndex = STEPS.indexOf(step);
  const canContinue: Record<Step, boolean> = {
    units: true,
    you: sex !== null && Number(age) >= 10 && Number(age) <= 120,
    body: resolvedHeightCm >= 80 && weightKg >= 25,
    activity: activity !== null,
    goal: goalKind === "maintain" || (goalKind !== null && rate !== null),
    result: true,
  };
  const stepHint: Record<Step, string> = {
    units: "",
    you: "Pick your sex and enter an age between 10 and 120.",
    body: "Enter your height and current weight to continue.",
    activity: "Choose the option that best matches your week.",
    goal: "Pick a goal — and a pace if you're losing or gaining.",
    result: "",
  };

  const next = () => setStep(step === "goal" ? "result" : STEPS[stepIndex + 1]);

  async function finish() {
    if (!goals || !plan || !macros) return;
    setSaving(true);
    try {
      await fetchJson("/api/weights", { method: "POST", body: JSON.stringify({ weight_kg: Math.round(weightKg * 100) / 100 }) });
      await fetchJson<Goals>("/api/goals", {
        method: "PUT",
        body: JSON.stringify({
          daily_calories: plan.intake,
          daily_protein_g: macros.protein_g,
          daily_carbs_g: macros.carbs_g,
          daily_fat_g: macros.fat_g,
          target_rate_kg_per_wk: effectiveRate,
          unit_system: imperial ? "imperial" : "metric",
          sex,
          age: Number(age),
          height_cm: Math.round(resolvedHeightCm * 10) / 10,
          activity_level: activity,
          onboarded: true,
        }),
      });
      tapSuccess();
      router.replace("/");
    } catch (err) {
      Alert.alert(err instanceof Error ? err.message : "Couldn't save");
      setSaving(false);
    }
  }

  const rates = ratePresets(imperial, goalKind === "gain" ? "gain" : "lose");

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-5 pb-6 pt-2">
        <View className="mb-6 flex-row items-center gap-3">
          {stepIndex > 0 ? (
            <Pressable onPress={() => setStep(STEPS[stepIndex - 1])} className="-ml-2 h-11 w-11 items-center justify-center">
              <Feather name="arrow-left" size={22} color="#000" />
            </Pressable>
          ) : null}
          <View className="flex-1 flex-row gap-1.5">
            {STEPS.map((s, i) => (
              <View key={s} className={`h-1.5 flex-1 ${i <= stepIndex ? "bg-primary" : "bg-muted"}`} />
            ))}
          </View>
        </View>

        <ScrollView contentContainerClassName="gap-5" showsVerticalScrollIndicator={false}>
          {step === "units" && (
            <StepShell title="Welcome to Mealio 👋" subtitle="A few quick questions and we'll work out exactly how much you should eat. First — which units do you use?">
              <View className="flex-row gap-3">
                <ChoiceCard className="flex-1" selected={!imperial} onPress={() => setImperial(false)} title="kg · cm" blurb="Kilograms & centimetres" />
                <ChoiceCard className="flex-1" selected={imperial} onPress={() => setImperial(true)} title="lb · ft" blurb="Pounds, feet & inches" />
              </View>
            </StepShell>
          )}

          {step === "you" && (
            <StepShell title="About you" subtitle="Your body burns calories all day just keeping you alive. Sex and age help us estimate that.">
              <View className="flex-row gap-3">
                <ChoiceCard className="flex-1" selected={sex === "male"} onPress={() => setSex("male")} title="Male" />
                <ChoiceCard className="flex-1" selected={sex === "female"} onPress={() => setSex("female")} title="Female" />
              </View>
              <Field label="Age">
                <Input keyboardType="number-pad" placeholder="e.g. 32" value={age} onChangeText={setAge} />
              </Field>
            </StepShell>
          )}

          {step === "body" && (
            <StepShell title="Your body" subtitle="Bigger bodies burn more calories. We'll also use this weight as your starting point on the chart.">
              {imperial ? (
                <Field label="Height (ft / in)">
                  <View className="flex-row gap-2">
                    <Input keyboardType="number-pad" placeholder="feet" value={heightFt} onChangeText={setHeightFt} className="flex-1" />
                    <Input keyboardType="number-pad" placeholder="inches" value={heightIn} onChangeText={setHeightIn} className="flex-1" />
                  </View>
                </Field>
              ) : (
                <Field label="Height (cm)">
                  <Input keyboardType="number-pad" placeholder="e.g. 175" value={heightCm} onChangeText={setHeightCm} />
                </Field>
              )}
              <Field label={`Current weight (${imperial ? "lb" : "kg"})`}>
                <Input keyboardType="decimal-pad" placeholder={imperial ? "e.g. 176" : "e.g. 80"} value={weight} onChangeText={setWeight} />
              </Field>
            </StepShell>
          )}

          {step === "activity" && (
            <StepShell title="How active are you?" subtitle="Be honest — most people pick one level too high. Exercise counts, but so does being on your feet all day.">
              <View className="gap-2">
                {ACTIVITY_LEVELS.map((level) => (
                  <ChoiceCard key={level.value} selected={activity === level.value} onPress={() => setActivity(level.value)} title={level.label} blurb={level.description} />
                ))}
              </View>
            </StepShell>
          )}

          {step === "goal" && (
            <StepShell title="What's your goal?" subtitle="Weight change comes down to calories in vs calories out. Pick a direction and a pace you can live with.">
              <View className="flex-row gap-2">
                {(["lose", "maintain", "gain"] as const).map((kind) => (
                  <ChoiceCard
                    key={kind}
                    className="flex-1"
                    selected={goalKind === kind}
                    onPress={() => {
                      setGoalKind(kind);
                      setRate(null);
                    }}
                    title={kind[0].toUpperCase() + kind.slice(1)}
                  />
                ))}
              </View>
              {goalKind && goalKind !== "maintain" ? (
                <View className="gap-2">
                  <Text className="text-sm font-medium text-muted-foreground">How fast?</Text>
                  {rates.map((option) => (
                    <ChoiceCard key={option.rate} selected={rate === option.rate} onPress={() => setRate(option.rate)} title={option.title} blurb={option.blurb} badge={option.recommended ? "Recommended" : undefined} />
                  ))}
                </View>
              ) : null}
            </StepShell>
          )}

          {step === "result" && plan && tdee !== null && macros ? (
            <StepShell title="Your plan is ready 🎉" subtitle="Here's what the numbers say. Log your meals and Mealio will check this against your real results.">
              <Card className="border-transparent bg-block-lime p-4 gap-4">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Feather name="zap" size={20} color="#000" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-foreground">Your body burns about</Text>
                    <Text className="text-xs text-muted-foreground">resting + daily activity</Text>
                  </View>
                  <Text className="text-2xl font-black tracking-tight tabular-nums text-foreground">{tdee.toLocaleString()} cal</Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
                    <Feather name="target" size={20} color="#fff" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-foreground">So you should eat</Text>
                    <Text className="text-xs text-muted-foreground">
                      {goalKind === "maintain"
                        ? "to hold steady"
                        : `a ${Math.abs(deficitForRate(effectiveRate)).toLocaleString()} cal/day ${effectiveRate < 0 ? "deficit" : "surplus"} to ${goalKind} ${kgToDisplay(Math.abs(effectiveRate), imperial)}/week`}
                    </Text>
                  </View>
                  <Text className="text-2xl font-black tracking-tight tabular-nums text-foreground">{plan.intake.toLocaleString()} cal</Text>
                </View>
                <View className="flex-row gap-2 bg-muted p-3">
                  {([["Protein", macros.protein_g, splitPcts.protein_pct], ["Carbs", macros.carbs_g, splitPcts.carbs_pct], ["Fat", macros.fat_g, splitPcts.fat_pct]] as const).map(([label, grams, pct]) => (
                    <View key={label} className="flex-1 items-center">
                      <Text className="text-xs text-muted-foreground">{label}</Text>
                      <Text className="font-bold tabular-nums text-foreground">{pct}%</Text>
                      <Text className="text-[10px] text-muted-foreground">{grams}g</Text>
                    </View>
                  ))}
                </View>
                <Text className="text-xs text-muted-foreground">
                  These are estimates to get you started. After ~2 weeks of logging, the Weight screen measures your actual burn and tells you if this needs adjusting.
                </Text>
              </Card>
            </StepShell>
          ) : null}
        </ScrollView>

        <View className="pt-6">
          {step === "result" ? (
            <Button onPress={finish} disabled={saving}>
              {saving ? <Spinner /> : <Text className="text-base font-bold text-white">Start tracking</Text>}
            </Button>
          ) : (
            <>
              {!canContinue[step] && stepHint[step] ? (
                <Text className="mb-2 text-center text-xs font-medium text-muted-foreground">{stepHint[step]}</Text>
              ) : null}
              <Button onPress={next} disabled={!canContinue[step]}>
                Continue
              </Button>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View className="gap-5">
      <View>
        <Kicker>Plan builder</Kicker>
        <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">{title}</Text>
        <Text className="mt-4 text-sm font-semibold text-muted-foreground">{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

function ChoiceCard({
  selected,
  onPress,
  title,
  blurb,
  badge,
  className = "",
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  blurb?: string;
  badge?: string;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-2xl border-2 p-3 ${selected ? "border-primary bg-primary" : "border-border bg-card"} ${className}`}
    >
      <View className="flex-row items-center gap-2">
        <Text className={`font-black tracking-tight ${selected ? "text-white" : "text-foreground"}`}>{title}</Text>
        {badge ? (
          <View className="rounded-full bg-background px-2 py-0.5">
            <Text className="text-[10px] font-extrabold text-foreground">{badge}</Text>
          </View>
        ) : null}
      </View>
      {blurb ? <Text className={`mt-0.5 text-xs font-semibold ${selected ? "text-white/80" : "text-muted-foreground"}`}>{blurb}</Text> : null}
    </Pressable>
  );
}
