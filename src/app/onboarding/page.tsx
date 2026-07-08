"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowLeft, Flame, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_LEVELS,
  bmrMifflinStJeor,
  deficitForRate,
  estimatedTdee,
  suggestedIntake,
  suggestedMacros,
  type ActivityLevel,
  type Sex,
} from "@/lib/bmr";
import { fetchJson, type Goals } from "@/lib/client";

const KG_PER_LB = 0.453592;
const CM_PER_IN = 2.54;

type Step = "units" | "you" | "body" | "activity" | "goal" | "result";
const STEPS: Step[] = ["units", "you", "body", "activity", "goal", "result"];

type GoalKind = "lose" | "maintain" | "gain";

// Rates in kg/week; shown to the user in their units with plain language
const LOSE_RATES = [
  {
    rate: -0.25,
    title: "Gentle",
    blurb: "Small changes you'll barely notice. Easiest to stick with.",
  },
  {
    rate: -0.5,
    title: "Steady",
    blurb: "The sweet spot for most people. Recommended.",
    recommended: true,
  },
  {
    rate: -0.75,
    title: "Ambitious",
    blurb: "Faster results, but you'll feel hungry some days.",
  },
];
const GAIN_RATES = [
  {
    rate: 0.125,
    title: "Lean gain",
    blurb: "Slow and mostly muscle. Recommended.",
    recommended: true,
  },
  {
    rate: 0.25,
    title: "Faster gain",
    blurb: "Quicker on the scale, some of it will be fat.",
  },
];

function kgToDisplay(kg: number, imperial: boolean): string {
  const v = imperial ? kg / KG_PER_LB : kg;
  return `${Math.round(v * 100) / 100} ${imperial ? "lb" : "kg"}`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goals | null>(null);
  const [step, setStep] = useState<Step>("units");
  const [saving, setSaving] = useState(false);

  // Answers
  const [imperial, setImperial] = useState(false);
  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weight, setWeight] = useState(""); // display units
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [goalKind, setGoalKind] = useState<GoalKind | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    // Prefill from a previous run (the "redo the steps" flow)
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
      .then((latest) => {
        if (latest) {
          setWeight((prev) => prev || String(latest.weight_kg));
        }
      })
      .catch(() => {});
  }, []);

  // Weight input follows the units choice; re-derive display when toggled
  const resolvedHeightCm = imperial
    ? (Number(heightFt || 0) * 12 + Number(heightIn || 0)) * CM_PER_IN
    : Number(heightCm || 0);
  const weightKg = imperial
    ? Number(weight || 0) * KG_PER_LB
    : Number(weight || 0);

  const effectiveRate = goalKind === "maintain" ? 0 : (rate ?? 0);
  const bmr =
    sex && Number(age) >= 10 && resolvedHeightCm >= 80 && weightKg >= 25
      ? bmrMifflinStJeor(sex, weightKg, resolvedHeightCm, Number(age))
      : null;
  const tdee = bmr !== null && activity ? estimatedTdee(bmr, activity) : null;
  const plan =
    bmr !== null && tdee !== null
      ? suggestedIntake(tdee, bmr, effectiveRate)
      : null;
  const macros =
    plan !== null ? suggestedMacros(plan.intake, weightKg) : null;

  const stepIndex = STEPS.indexOf(step);

  const canContinue: Record<Step, boolean> = {
    units: true,
    you: sex !== null && Number(age) >= 10 && Number(age) <= 120,
    body: resolvedHeightCm >= 80 && weightKg >= 25,
    activity: activity !== null,
    goal: goalKind === "maintain" || (goalKind !== null && rate !== null),
    result: true,
  };

  function next() {
    if (step === "goal") setStep("result");
    else setStep(STEPS[stepIndex + 1]);
  }

  async function finish() {
    if (!goals || !plan || !macros) return;
    setSaving(true);
    try {
      await fetchJson("/api/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight_kg: Math.round(weightKg * 100) / 100 }),
      });
      const saved = await fetchJson<Goals>("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
      void saved;
      toast.success("You're all set!");
      router.replace("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
      setSaving(false);
    }
  }

  const rates = goalKind === "gain" ? GAIN_RATES : LOSE_RATES;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-8 pt-6">
      {/* Progress */}
      <div className="mb-6 flex items-center gap-3">
        {stepIndex > 0 ? (
          <button
            aria-label="Back"
            onClick={() => setStep(STEPS[stepIndex - 1])}
            className="text-muted-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <Image src="/icon.svg" alt="" width={22} height={22} className="rounded" />
        )}
        <div className="flex flex-1 gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= stepIndex ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>

      {step === "units" && (
        <StepShell
          title="Welcome to SnapCal 👋"
          subtitle="A few quick questions and we'll work out exactly how much you should eat. First — which units do you use?"
        >
          <div className="grid grid-cols-2 gap-3">
            <ChoiceCard
              selected={!imperial}
              onClick={() => setImperial(false)}
              title="kg · cm"
              blurb="Kilograms & centimetres"
            />
            <ChoiceCard
              selected={imperial}
              onClick={() => setImperial(true)}
              title="lb · ft"
              blurb="Pounds, feet & inches"
            />
          </div>
        </StepShell>
      )}

      {step === "you" && (
        <StepShell
          title="About you"
          subtitle="Your body burns calories all day just keeping you alive. Sex and age help us estimate that."
        >
          <div className="grid grid-cols-2 gap-3">
            <ChoiceCard
              selected={sex === "male"}
              onClick={() => setSex("male")}
              title="Male"
            />
            <ChoiceCard
              selected={sex === "female"}
              onClick={() => setSex("female")}
              title="Female"
            />
          </div>
          <Field>
            <FieldLabel htmlFor="ob-age">Age</FieldLabel>
            <Input
              id="ob-age"
              type="number"
              inputMode="numeric"
              placeholder="e.g. 32"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </Field>
        </StepShell>
      )}

      {step === "body" && (
        <StepShell
          title="Your body"
          subtitle="Bigger bodies burn more calories. We'll also use this weight as your starting point on the chart."
        >
          <FieldGroup>
            {imperial ? (
              <Field>
                <FieldLabel htmlFor="ob-ft">Height</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="ob-ft"
                    type="number"
                    inputMode="numeric"
                    placeholder="feet"
                    value={heightFt}
                    onChange={(e) => setHeightFt(e.target.value)}
                  />
                  <Input
                    aria-label="inches"
                    type="number"
                    inputMode="numeric"
                    placeholder="inches"
                    value={heightIn}
                    onChange={(e) => setHeightIn(e.target.value)}
                  />
                </div>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="ob-height">Height (cm)</FieldLabel>
                <Input
                  id="ob-height"
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 175"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="ob-weight">
                Current weight ({imperial ? "lb" : "kg"})
              </FieldLabel>
              <Input
                id="ob-weight"
                type="number"
                inputMode="decimal"
                placeholder={imperial ? "e.g. 176" : "e.g. 80"}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Field>
          </FieldGroup>
        </StepShell>
      )}

      {step === "activity" && (
        <StepShell
          title="How active are you?"
          subtitle="Be honest — most people pick one level too high. Exercise counts, but so does being on your feet all day."
        >
          <div className="flex flex-col gap-2">
            {ACTIVITY_LEVELS.map((level) => (
              <ChoiceCard
                key={level.value}
                selected={activity === level.value}
                onClick={() => setActivity(level.value)}
                title={level.label}
                blurb={level.description}
              />
            ))}
          </div>
        </StepShell>
      )}

      {step === "goal" && (
        <StepShell
          title="What's your goal?"
          subtitle="Weight change comes down to calories in vs calories out. Pick a direction and a pace you can live with."
        >
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["lose", "Lose"],
                ["maintain", "Maintain"],
                ["gain", "Gain"],
              ] as const
            ).map(([kind, label]) => (
              <ChoiceCard
                key={kind}
                selected={goalKind === kind}
                onClick={() => {
                  setGoalKind(kind);
                  setRate(null);
                }}
                title={label}
              />
            ))}
          </div>
          {goalKind && goalKind !== "maintain" ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-sm font-medium">
                How fast?
              </p>
              {rates.map((option) => (
                <ChoiceCard
                  key={option.rate}
                  selected={rate === option.rate}
                  onClick={() => setRate(option.rate)}
                  title={`${option.title} · ${kgToDisplay(Math.abs(option.rate), imperial)}/week`}
                  blurb={option.blurb}
                  badge={option.recommended ? "Recommended" : undefined}
                />
              ))}
            </div>
          ) : null}
        </StepShell>
      )}

      {step === "result" && plan && tdee !== null && macros ? (
        <StepShell
          title="Your plan is ready 🎉"
          subtitle="Here's what the numbers say. Log your meals and SnapCal will check this against your real results."
        >
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-full">
                  <Flame className="size-5" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Your body burns about</p>
                  <p className="text-muted-foreground text-xs">
                    resting + daily activity
                  </p>
                </div>
                <span className="text-lg font-bold tabular-nums">
                  {tdee.toLocaleString()} kcal
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-full">
                  <Target className="size-5" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">So you should eat</p>
                  <p className="text-muted-foreground text-xs">
                    {goalKind === "maintain"
                      ? "to hold steady"
                      : `a ${Math.abs(deficitForRate(effectiveRate)).toLocaleString()} kcal/day ${
                          effectiveRate < 0 ? "deficit" : "surplus"
                        } to ${goalKind} ${kgToDisplay(Math.abs(effectiveRate), imperial)}/week`}
                  </p>
                </div>
                <span className="text-primary text-lg font-bold tabular-nums">
                  {plan.intake.toLocaleString()} kcal
                </span>
              </div>
              {plan.floored ? (
                <p className="text-muted-foreground text-xs">
                  We capped this at a safe minimum — eating less than this
                  isn&apos;t sustainable or healthy.
                </p>
              ) : null}
              <div className="bg-muted grid grid-cols-3 gap-2 rounded-xl p-3 text-center">
                {(
                  [
                    ["Protein", macros.protein_g],
                    ["Carbs", macros.carbs_g],
                    ["Fat", macros.fat_g],
                  ] as const
                ).map(([label, grams]) => (
                  <div key={label}>
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="font-bold tabular-nums">{grams}g</p>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                These are estimates to get you started. After ~2 weeks of
                logging, the Trends screen measures your{" "}
                <span className="font-medium">actual</span> burn from your real
                weight change and tells you if this number needs adjusting.
              </p>
            </CardContent>
          </Card>
        </StepShell>
      ) : null}

      <div className="mt-auto pt-6">
        {step === "result" ? (
          <Button size="lg" className="w-full" onClick={finish} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Start tracking
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full"
            onClick={next}
            disabled={!canContinue[step]}
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  title,
  blurb,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  blurb?: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border-2 p-3 text-left transition-colors",
        selected
          ? "border-primary bg-accent/60"
          : "border-border bg-card active:bg-accent/30",
      )}
    >
      <span className="flex items-center gap-2">
        <span className="font-semibold">{title}</span>
        {badge ? (
          <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold">
            {badge}
          </span>
        ) : null}
      </span>
      {blurb ? (
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {blurb}
        </span>
      ) : null}
    </button>
  );
}
