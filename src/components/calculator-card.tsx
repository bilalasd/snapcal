"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ACTIVITY_LEVELS,
  bmrMifflinStJeor,
  deficitForRate,
  estimatedTdee,
  suggestedIntake,
  type ActivityLevel,
  type Sex,
} from "@/lib/bmr";
import { fetchJson, type Goals } from "@/lib/client";

const KG_PER_LB = 0.453592;
const CM_PER_IN = 2.54;

interface CalculatorCardProps {
  goals: Goals;
  onGoalsSaved: (goals: Goals) => void;
}

export function CalculatorCard({ goals, onGoalsSaved }: CalculatorCardProps) {
  const imperial = goals.unit_system === "imperial";

  const [sex, setSex] = useState<Sex | "">(goals.sex ?? "");
  const [age, setAge] = useState<string>(goals.age ? String(goals.age) : "");
  const [activity, setActivity] = useState<ActivityLevel | "">(
    goals.activity_level ?? "",
  );
  // Height: cm (metric) or ft+in (imperial); stored canonically in cm
  const [heightCm, setHeightCm] = useState<string>(
    goals.height_cm ? String(Math.round(goals.height_cm)) : "",
  );
  const [heightFt, setHeightFt] = useState<string>(
    goals.height_cm ? String(Math.floor(goals.height_cm / CM_PER_IN / 12)) : "",
  );
  const [heightIn, setHeightIn] = useState<string>(
    goals.height_cm
      ? String(Math.round((goals.height_cm / CM_PER_IN) % 12))
      : "",
  );
  const [weight, setWeight] = useState<string>(""); // in display units
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    // Prefill weight from the most recent synced weigh-in
    fetchJson<{ weight_kg: number } | null>("/api/weights/latest")
      .then((latest) => {
        if (latest) {
          const display = imperial
            ? latest.weight_kg / KG_PER_LB
            : latest.weight_kg;
           
          setWeight((prev) => prev || String(Math.round(display * 10) / 10));
        }
      })
      .catch(() => {});
  }, [imperial]);

  const resolvedHeightCm = imperial
    ? (Number(heightFt || 0) * 12 + Number(heightIn || 0)) * CM_PER_IN
    : Number(heightCm || 0);
  const weightKg = imperial
    ? Number(weight || 0) * KG_PER_LB
    : Number(weight || 0);

  const complete =
    sex !== "" &&
    Number(age) >= 10 &&
    resolvedHeightCm >= 80 &&
    weightKg >= 25 &&
    activity !== "";

  const bmr = complete
    ? bmrMifflinStJeor(sex as Sex, weightKg, resolvedHeightCm, Number(age))
    : null;
  const tdee =
    bmr !== null ? estimatedTdee(bmr, activity as ActivityLevel) : null;
  const deficit = deficitForRate(goals.target_rate_kg_per_wk);
  const suggestion =
    tdee !== null && bmr !== null
      ? suggestedIntake(tdee, bmr, goals.target_rate_kg_per_wk)
      : null;

  async function applyGoal() {
    if (!suggestion) return;
    setApplying(true);
    try {
      const saved = await fetchJson<Goals>("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...goals,
          daily_calories: suggestion.intake,
          sex: sex || null,
          age: Number(age) || null,
          height_cm: resolvedHeightCm || null,
          activity_level: activity || null,
        }),
      });
      onGoalsSaved(saved);
      toast.success(
        `Daily goal set to ${suggestion.intake.toLocaleString()} kcal`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save goal");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="size-4" />
          Calorie calculator
        </CardTitle>
        <CardDescription>
          Estimate your burn (BMR + activity) and get a starting calorie goal
          for your target rate. The Trends screen refines this with your real
          data over time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="calc-sex">Sex</FieldLabel>
              <Select
                value={sex}
                onValueChange={(v) => setSex(v as Sex)}
              >
                <SelectTrigger id="calc-sex">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="calc-age">Age</FieldLabel>
              <Input
                id="calc-age"
                type="number"
                inputMode="numeric"
                min={10}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {imperial ? (
              <Field>
                <FieldLabel htmlFor="calc-ft">Height (ft / in)</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="calc-ft"
                    type="number"
                    inputMode="numeric"
                    placeholder="ft"
                    value={heightFt}
                    onChange={(e) => setHeightFt(e.target.value)}
                  />
                  <Input
                    aria-label="Height inches"
                    type="number"
                    inputMode="numeric"
                    placeholder="in"
                    value={heightIn}
                    onChange={(e) => setHeightIn(e.target.value)}
                  />
                </div>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="calc-height">Height (cm)</FieldLabel>
                <Input
                  id="calc-height"
                  type="number"
                  inputMode="numeric"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="calc-weight">
                Weight ({imperial ? "lbs" : "kg"})
              </FieldLabel>
              <Input
                id="calc-weight"
                type="number"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="calc-activity">Activity level</FieldLabel>
            <Select
              value={activity}
              onValueChange={(v) => setActivity(v as ActivityLevel)}
            >
              <SelectTrigger id="calc-activity">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ACTIVITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label} — {level.description}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        {bmr !== null && tdee !== null && suggestion !== null ? (
          <>
            <Separator className="my-4" />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-muted-foreground text-xs">BMR</p>
                <p className="font-bold tabular-nums">
                  {bmr.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-[10px]">kcal/day</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Est. burn</p>
                <p className="font-bold tabular-nums">
                  {tdee.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-[10px]">kcal/day</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">
                  {deficit >= 0 ? "Deficit" : "Surplus"} needed
                </p>
                <p className="font-bold tabular-nums">
                  {Math.abs(deficit).toLocaleString()}
                </p>
                <p className="text-muted-foreground text-[10px]">kcal/day</p>
              </div>
            </div>
            <div className="bg-accent/50 mt-4 flex flex-col gap-2 rounded-xl p-3">
              <p className="text-sm">
                To {goals.target_rate_kg_per_wk <= 0 ? "lose" : "gain"}{" "}
                <span className="font-semibold">
                  {Math.abs(goals.target_rate_kg_per_wk)} kg/week
                </span>
                , eat about{" "}
                <span className="text-primary font-bold">
                  {suggestion.intake.toLocaleString()} kcal/day
                </span>
                .
                {suggestion.floored
                  ? " (Capped at a safe minimum — your target rate would require eating too little.)"
                  : ""}
              </p>
              <Button size="sm" onClick={applyGoal} disabled={applying}>
                Set as my daily goal
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground mt-3 text-xs">
            Fill in all fields to see your numbers.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
