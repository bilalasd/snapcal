import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform, Linking } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  useReducedMotion,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useCameraPermissions } from "expo-camera";
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
} from "@loggi/shared";
import { fetchJson } from "../lib/api";
import { useColors, block } from "../lib/colors";
import { setCachedGoals } from "../lib/cache";
import { tapSuccess } from "../lib/haptics";
import { appleHealthSupported, connectAppleHealth } from "../lib/apple-health";
import { enableMondayNote } from "../lib/monday-note";
import { Card, Button, ChoiceCard, Input, Field, Kicker, ProgressSegment } from "../components/ui";
import { Bevi } from "../components/bevi";
import { PressableScale } from "../components/pressable-scale";

const KG_PER_LB = 0.453592;
const CM_PER_IN = 2.54;

type Step = "you" | "body" | "activity" | "goal" | "permissions" | "result";
const STEPS: Step[] = ["you", "body", "activity", "goal", "permissions", "result"];

// Default units from the device region (US, Liberia, Myanmar are imperial);
// the body step keeps a toggle for everyone the guess misses.
function localeImperial(): boolean {
  try {
    const region = Intl.DateTimeFormat().resolvedOptions().locale.split("-").pop() ?? "";
    return ["US", "LR", "MM"].includes(region.toUpperCase());
  } catch {
    return false;
  }
}

type GoalKind = "lose" | "maintain" | "gain";

const KG = { gentle: -0.25, steady: -0.5, ambitious: -0.75, leanGain: 0.125, fastGain: 0.25 };
const LB = { gentle: -0.5 * KG_PER_LB, steady: -1 * KG_PER_LB, ambitious: -1.5 * KG_PER_LB, leanGain: 0.5 * KG_PER_LB, fastGain: 1 * KG_PER_LB };

function ratePresets(imperial: boolean, kind: "lose" | "gain") {
  const v = imperial ? LB : KG;
  const label = (n: number) => (imperial ? `${n} lb/week` : `${n} kg/week`);
  if (kind === "gain") {
    return [
      { rate: v.leanGain, title: `Lean gain · ${label(imperial ? 0.5 : 0.125)}`, blurb: "Slow and mostly muscle.", recommended: true },
      { rate: v.fastGain, title: `Faster gain · ${label(imperial ? 1 : 0.25)}`, blurb: "Quicker on the scale, some of it will be fat." },
    ];
  }
  return [
    { rate: v.gentle, title: `Gentle · ${label(imperial ? 0.5 : 0.25)}`, blurb: "Small changes you'll barely notice. Easiest to stick with." },
    { rate: v.steady, title: `Steady · ${label(imperial ? 1 : 0.5)}`, blurb: "The sweet spot for most people.", recommended: true },
    { rate: v.ambitious, title: `Ambitious · ${label(imperial ? 1.5 : 0.75)}`, blurb: "Faster results, but you'll feel hungry some days." },
  ];
}

const kgToDisplay = (kg: number, imperial: boolean) => `${Math.round((imperial ? kg / KG_PER_LB : kg) * 100) / 100} ${imperial ? "lb" : "kg"}`;

export default function Onboarding() {
  const router = useRouter();
  const colors = useColors();
  const reduce = useReducedMotion();
  const direction = useRef<1 | -1>(1);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [step, setStep] = useState<Step>("you");
  const [saving, setSaving] = useState(false);

  const [imperial, setImperial] = useState(localeImperial);
  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [goalKind, setGoalKind] = useState<GoalKind | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  // Permission asks (all optional). Camera state lives in the hook; the other
  // two are request-and-remember.
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [notif, setNotif] = useState<"idle" | "granted" | "denied">("idle");
  const [health, setHealth] = useState<"idle" | "granted" | "denied">("idle");
  const cameraState = camPerm?.granted ? "granted" : camPerm && !camPerm.canAskAgain ? "denied" : "idle";

  useEffect(() => {
    // Sequential on purpose: units must be settled before the weight prefill,
    // or a kg figure could land in an lb field and poison the first trend point.
    (async () => {
      let imp = localeImperial();
      try {
        const g = await fetchJson<Goals>("/api/goals");
        setGoals(g);
        // Only a finished onboarding has deliberately chosen units — for new
        // users the server default would clobber the locale guess.
        if (g.onboarded) {
          imp = g.unit_system === "imperial";
          setImperial(imp);
        }
        if (g.sex) setSex(g.sex);
        if (g.age) setAge(String(g.age));
        if (g.height_cm) {
          setHeightCm(String(Math.round(g.height_cm)));
          const totalIn = Math.round(g.height_cm / CM_PER_IN);
          setHeightFt(String(Math.floor(totalIn / 12)));
          setHeightIn(String(totalIn % 12));
        }
        if (g.activity_level) setActivity(g.activity_level);
      } catch {}
      try {
        const latest = await fetchJson<{ weight_kg: number } | null>("/api/weights/latest");
        if (latest) {
          const shown = imp ? latest.weight_kg / KG_PER_LB : latest.weight_kg;
          setWeight((prev) => prev || String(Math.round(shown * 10) / 10));
        }
      } catch {}
    })();
  }, []);

  // Flipping units converts anything already typed in place — the same
  // no-lost-edits rule as Settings. A number never gets silently re-labeled.
  function switchUnits(next: boolean) {
    if (next === imperial) return;
    const w = Number(weight);
    if (weight && Number.isFinite(w) && w > 0) {
      setWeight(String(Math.round((next ? w / KG_PER_LB : w * KG_PER_LB) * 10) / 10));
    }
    const cm = Number(heightCm);
    const totalInTyped = Number(heightFt || 0) * 12 + Number(heightIn || 0);
    if (next) {
      if (heightCm && Number.isFinite(cm) && cm > 0) {
        const totalIn = Math.round(cm / CM_PER_IN);
        setHeightFt(String(Math.floor(totalIn / 12)));
        setHeightIn(String(totalIn % 12));
      }
    } else if ((heightFt || heightIn) && Number.isFinite(totalInTyped) && totalInTyped > 0) {
      setHeightCm(String(Math.round(totalInTyped * CM_PER_IN)));
    }
    setImperial(next);
  }

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
    you: sex !== null && Number(age) >= 10 && Number(age) <= 120,
    body: resolvedHeightCm >= 80 && weightKg >= 25,
    activity: activity !== null,
    goal: goalKind === "maintain" || (goalKind !== null && rate !== null),
    permissions: true,
    result: true,
  };
  const stepHint: Record<Step, string> = {
    you: "Sex and age set the size of the estimate — I need both.",
    body: "Height and today's weight — that weigh-in starts your trend.",
    activity: "Pick whichever sounds most like your week.",
    goal: "Pick a direction — and a pace, if you're losing or gaining.",
    permissions: "",
    result: "",
  };

  const next = () => {
    direction.current = 1;
    setStep(STEPS[stepIndex + 1]);
  };
  const back = () => {
    if (stepIndex === 0) return;
    direction.current = -1;
    setStep(STEPS[stepIndex - 1]);
  };

  async function finish() {
    if (!goals || !plan || !macros) return;
    setSaving(true);
    try {
      // Independent writes — the first weigh-in and the goals save in parallel.
      const [, saved] = await Promise.all([
        fetchJson("/api/weights", { method: "POST", body: JSON.stringify({ weight_kg: Math.round(weightKg * 100) / 100 }) }),
        fetchJson<Goals>("/api/goals", {
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
        }),
      ]);
      setCachedGoals(saved);
      tapSuccess();
      router.replace("/paywall");
    } catch (err) {
      Alert.alert(
        "Couldn't save your plan",
        `${err instanceof Error ? err.message : "Something went wrong"} — your answers are still here, give it another go.`,
      );
      setSaving(false);
    }
  }

  const rates = ratePresets(imperial, goalKind === "gain" ? "gain" : "lose");

  async function askNotifications() {
    if (notif === "granted") return;
    if (notif === "denied") return void Linking.openSettings();
    const ok = await enableMondayNote();
    setNotif(ok ? "granted" : "denied");
  }

  async function askHealth() {
    if (health !== "idle") return;
    const ok = await connectAppleHealth();
    setHealth(ok ? "granted" : "denied");
  }

  function askCamera() {
    if (cameraState === "granted") return;
    if (cameraState === "denied") return void Linking.openSettings();
    void requestCamPerm();
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Animated.View entering={reduce ? undefined : FadeIn.duration(130)} style={{ flex: 1 }}>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View className="flex-1 px-5 pb-6 pt-2">
            <View className="mb-6 flex-row items-center gap-3">
              {stepIndex > 0 ? (
                <Pressable
                  onPress={back}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  className="-ml-2 h-11 w-11 items-center justify-center active:opacity-60"
                >
                  <Feather name="arrow-left" size={22} color={colors.foreground} />
                </Pressable>
              ) : (
                <View className="-ml-2 h-11 w-11" />
              )}
              <View className="flex-1 flex-row gap-1.5">
                {STEPS.map((s, i) => (
                  <ProgressSegment key={s} filled={i <= stepIndex} />
                ))}
              </View>
            </View>

            <ScrollView contentContainerClassName="gap-5" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Animated.View
                key={step}
                entering={
                  reduce
                    ? undefined
                    : (direction.current === 1 ? FadeInRight : FadeInLeft).duration(130).easing(Easing.out(Easing.quad))
                }
              >
                {step === "you" && (
                  <StepShell title="About you" subtitle="A few quick questions and I'll work out your starting numbers. Sex and age first — your body burns calories all day, even asleep, and they size that estimate.">
                    <View className="flex-row gap-3">
                      <View className="flex-1"><ChoiceCard selected={sex === "male"} onPress={() => setSex("male")} title="Male" /></View>
                      <View className="flex-1"><ChoiceCard selected={sex === "female"} onPress={() => setSex("female")} title="Female" /></View>
                    </View>
                    <Text className="text-xs font-medium text-muted-foreground">
                      The formula only knows these two — pick whichever is closest.
                    </Text>
                    <Field label="Age">
                      <Input keyboardType="number-pad" placeholder="e.g. 32" value={age} onChangeText={setAge} />
                    </Field>
                  </StepShell>
                )}

                {step === "body" && (
                  <StepShell title="Your body" subtitle="Bigger bodies burn more calories. This weigh-in also becomes the first point on your trend.">
                    <View className="flex-row gap-3">
                      <View className="flex-1"><ChoiceCard selected={!imperial} onPress={() => switchUnits(false)} title="kg · cm" /></View>
                      <View className="flex-1"><ChoiceCard selected={imperial} onPress={() => switchUnits(true)} title="lb · ft" /></View>
                    </View>
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
                  <StepShell title="How active are you?" subtitle="Be honest — most people pick one level too high, and an honest pick means a target you can trust. Being on your feet counts too.">
                    <View className="gap-2">
                      {ACTIVITY_LEVELS.map((level) => (
                        <ChoiceCard key={level.value} selected={activity === level.value} onPress={() => setActivity(level.value)} title={level.label} blurb={level.description} />
                      ))}
                    </View>
                  </StepShell>
                )}

                {step === "goal" && (
                  <StepShell title="What's your goal?" subtitle="Pick a direction and a pace you can live with — the gentler the pace, the easier it is to keep.">
                    <View className="flex-row gap-2">
                      {(["lose", "maintain", "gain"] as const).map((kind) => (
                        <View key={kind} className="flex-1">
                          <ChoiceCard
                            selected={goalKind === kind}
                            onPress={() => {
                              setGoalKind(kind);
                              setRate(null);
                            }}
                            title={kind[0].toUpperCase() + kind.slice(1)}
                          />
                        </View>
                      ))}
                    </View>
                    {goalKind && goalKind !== "maintain" ? (
                      <Animated.View key={goalKind} entering={reduce ? undefined : FadeIn.duration(130)} style={{ gap: 8 }}>
                        <Text className="text-sm font-medium text-muted-foreground">How fast?</Text>
                        {rates.map((option) => (
                          <ChoiceCard key={option.rate} selected={rate === option.rate} onPress={() => setRate(option.rate)} title={option.title} blurb={option.blurb} badge={option.recommended ? "Recommended" : undefined} />
                        ))}
                      </Animated.View>
                    ) : null}
                  </StepShell>
                )}

                {step === "permissions" && (
                  <StepShell title="A few quick asks" subtitle="All optional — everything works without them. Each yes just removes a step later, and Settings can flip any of these anytime.">
                    <View className="gap-2">
                      <PermissionRow
                        icon="camera"
                        title="Camera"
                        blurb="The front door — point it at plates, labels, and barcodes."
                        state={cameraState}
                        deniedNote="No problem — you can turn it on in Settings whenever."
                        onPress={askCamera}
                      />
                      <PermissionRow
                        icon="bell"
                        title="Bevi's Monday note"
                        blurb="One notification a week: your verdict and the new target, Monday morning."
                        state={notif}
                        deniedNote="No problem — Settings can turn it on whenever."
                        onPress={() => void askNotifications()}
                      />
                      {appleHealthSupported() ? (
                        <PermissionRow
                          icon="heart"
                          title="Apple Health"
                          blurb="I read new weigh-ins automatically, so the trend stays current."
                          state={health}
                          deniedNote="No problem — connect it later from Settings."
                          onPress={() => void askHealth()}
                        />
                      ) : null}
                    </View>
                  </StepShell>
                )}

                {step === "result" && plan && tdee !== null && macros ? (
                  <StepShell title="Your starting plan is ready" subtitle="Here's what the formula says. Log your meals and weigh in when you can — in about two weeks, your scale takes over.">
                    <View className="items-center">
                      <Bevi pose="celebrate" size={140} />
                    </View>
                    <Card style={{ backgroundColor: block.lime, borderColor: "transparent" }} className="p-4 gap-4">
                      {/* The payoff moment: rows settle in sequence (130ms each, short beats). */}
                      <Animated.View entering={reduce ? undefined : FadeInUp.duration(130).delay(60).easing(Easing.out(Easing.quad))}>
                      <View className="flex-row items-center gap-3">
                        <View className="h-10 w-10 items-center justify-center rounded-full bg-black/10">
                          <Feather name="zap" size={20} color="#000" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-bold text-black">Your body burns about</Text>
                          <Text className="text-xs text-black/60">resting + daily activity</Text>
                        </View>
                        <Text className="text-2xl font-black tracking-tight tabular-nums text-black">{tdee.toLocaleString()} cal</Text>
                      </View>
                      </Animated.View>
                      <Animated.View entering={reduce ? undefined : FadeInUp.duration(130).delay(120).easing(Easing.out(Easing.quad))}>
                      <View className="flex-row items-center gap-3">
                        <View className="h-10 w-10 items-center justify-center rounded-full bg-black">
                          <Feather name="target" size={20} color="#fff" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-bold text-black">So you should eat</Text>
                          <Text className="text-xs text-black/60">
                            {goalKind === "maintain"
                              ? "to hold steady"
                              : `a ${Math.abs(deficitForRate(effectiveRate)).toLocaleString()} cal/day ${effectiveRate < 0 ? "deficit" : "surplus"} to ${goalKind} ${kgToDisplay(Math.abs(effectiveRate), imperial)}/week`}
                          </Text>
                        </View>
                        <Text className="text-2xl font-black tracking-tight tabular-nums text-black">{plan.intake.toLocaleString()} cal</Text>
                      </View>
                      </Animated.View>
                      <Animated.View entering={reduce ? undefined : FadeInUp.duration(130).delay(180).easing(Easing.out(Easing.quad))}>
                      <View className="flex-row gap-2 rounded-2xl bg-black/10 p-3">
                        {([["Protein", macros.protein_g, splitPcts.protein_pct], ["Carbs", macros.carbs_g, splitPcts.carbs_pct], ["Fat", macros.fat_g, splitPcts.fat_pct]] as const).map(([label, grams, pct]) => (
                          <View key={label} className="flex-1 items-center">
                            <Text className="text-xs text-black/60">{label}</Text>
                            <Text className="font-bold tabular-nums text-black">{pct}%</Text>
                            <Text className="text-[10px] text-black/60">{grams}g</Text>
                          </View>
                        ))}
                      </View>
                      </Animated.View>
                      <Animated.View entering={reduce ? undefined : FadeIn.duration(130).delay(240).easing(Easing.out(Easing.quad))}>
                      <Text className="text-xs text-black/60">
                        These numbers are my starting guess. Once there's about two weeks of real data, the Weight screen measures your actual burn and I'll tell you if this needs adjusting.
                      </Text>
                      </Animated.View>
                    </Card>
                  </StepShell>
                ) : null}
              </Animated.View>
            </ScrollView>

            <View className="pt-6">
              {step === "result" ? (
                <Button onPress={finish} loading={saving}>Start tracking</Button>
              ) : (
                <>
                  {!canContinue[step] && stepHint[step] ? (
                    <Animated.View entering={reduce ? undefined : FadeIn.duration(130)}>
                      <Text className="mb-2 text-center text-xs font-medium text-muted-foreground">{stepHint[step]}</Text>
                    </Animated.View>
                  ) : null}
                  <Button onPress={next} disabled={!canContinue[step]}>
                    Continue
                  </Button>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View className="gap-5">
      <View>
        <Kicker>Plan desk</Kicker>
        <Text className="mt-1 text-4xl font-black tracking-tighter text-foreground">{title}</Text>
        <Text className="mt-4 text-sm font-semibold text-muted-foreground">{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

/** One optional permission ask: icon, why-one-liner, and a live state — granted
 *  flips the card primary (like a selected ChoiceCard), a system "no" swaps the
 *  blurb for a no-guilt pointer to Settings. */
function PermissionRow({
  icon,
  title,
  blurb,
  state,
  deniedNote,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  blurb: string;
  state: "idle" | "granted" | "denied";
  deniedNote: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const granted = state === "granted";
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: granted }}>
      {/* Chrome on a plain View — see ChoiceCard in ui.tsx. */}
      <View className={`flex-row items-center gap-3 rounded-2xl border-2 p-3 ${granted ? "border-primary bg-primary" : "border-border bg-card"}`}>
        <View className={`h-10 w-10 items-center justify-center rounded-full ${granted ? "bg-background" : "bg-muted"}`}>
          <Feather name={icon} size={18} color={colors.foreground} />
        </View>
        <View className="flex-1">
          <Text className={`font-black tracking-tight ${granted ? "text-primary-foreground" : "text-foreground"}`}>{title}</Text>
          <Text className={`mt-0.5 text-xs font-semibold ${granted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
            {state === "denied" ? deniedNote : blurb}
          </Text>
        </View>
        <Feather
          name={granted ? "check" : "chevron-right"}
          size={18}
          color={granted ? colors.background : colors.mutedForeground}
        />
      </View>
    </PressableScale>
  );
}
