"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, RotateCcw, Target } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { fetchJson, type Goals } from "@/lib/client";

const KG_PER_LB = 0.453592;

interface GoalCardProps {
  goals: Goals;
  onGoalsSaved: (goals: Goals) => void;
}

export function GoalCard({ goals, onGoalsSaved }: GoalCardProps) {
  const router = useRouter();
  const imperial = goals.unit_system === "imperial";
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const displayRate = imperial
    ? goals.target_rate_kg_per_wk / KG_PER_LB
    : goals.target_rate_kg_per_wk;
  const unit = imperial ? "lb" : "kg";

  const [rateInput, setRateInput] = useState(
    String(Math.round(Math.abs(displayRate) * 100) / 100),
  );
  const [direction, setDirection] = useState<"lose" | "maintain" | "gain">(
    goals.target_rate_kg_per_wk < 0
      ? "lose"
      : goals.target_rate_kg_per_wk > 0
        ? "gain"
        : "maintain",
  );
  const [caloriesInput, setCaloriesInput] = useState(
    String(goals.daily_calories),
  );
  const [goalWeightInput, setGoalWeightInput] = useState(
    goals.goal_weight_kg == null
      ? ""
      : String(
          Math.round(
            (imperial ? goals.goal_weight_kg / KG_PER_LB : goals.goal_weight_kg) *
              10,
          ) / 10,
        ),
  );

  const summary =
    goals.target_rate_kg_per_wk === 0
      ? "Maintain current weight"
      : `${goals.target_rate_kg_per_wk < 0 ? "Lose" : "Gain"} ${
          Math.round(Math.abs(displayRate) * 100) / 100
        } ${unit}/week`;

  function pendingPlan() {
    const magnitude = Math.abs(Number(rateInput) || 0);
    const displayValue =
      direction === "maintain"
        ? 0
        : direction === "lose"
          ? -magnitude
          : magnitude;
    const rateKg = imperial ? displayValue * KG_PER_LB : displayValue;
    const calories = Math.round(Number(caloriesInput));
    return { magnitude, rateKg, calories };
  }

  function requestSave() {
    const { calories } = pendingPlan();
    if (calories < 500) {
      toast.error("Daily calories look too low");
      return;
    }
    setConfirming(true);
  }

  async function saveManual() {
    const { rateKg, calories } = pendingPlan();
    setConfirming(false);
    setSaving(true);
    const gwNum = Number(goalWeightInput);
    const goalWeightKg =
      goalWeightInput.trim() === "" || gwNum <= 0
        ? null
        : Math.round((imperial ? gwNum * KG_PER_LB : gwNum) * 100) / 100;
    try {
      const saved = await fetchJson<Goals>("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...goals,
          daily_calories: calories,
          target_rate_kg_per_wk: Math.round(rateKg * 100) / 100,
          goal_weight_kg: goalWeightKg,
        }),
      });
      onGoalsSaved(saved);
      toast.success("Goal updated");
      setOpen(false);
      setManual(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4" />
            Your goal
          </CardTitle>
          <CardDescription>
            {summary} · eating {goals.daily_calories.toLocaleString()} kcal/day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Change goal
          </Button>
        </CardContent>
      </Card>

      <Drawer
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setManual(false);
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Change your goal</DrawerTitle>
            <DrawerDescription>
              {manual
                ? "Set your target and daily calories yourself."
                : "Redo the guided steps (recommended — it recalculates everything for you), or set the numbers manually."}
            </DrawerDescription>
          </DrawerHeader>

          {manual ? (
            <div className="px-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Direction</FieldLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["lose", "Lose"],
                        ["maintain", "Maintain"],
                        ["gain", "Gain"],
                      ] as const
                    ).map(([kind, label]) => (
                      <Button
                        key={kind}
                        type="button"
                        variant={direction === kind ? "default" : "outline"}
                        onClick={() => setDirection(kind)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </Field>
                {direction !== "maintain" ? (
                  <Field>
                    <FieldLabel htmlFor="goal-rate">
                      Rate ({unit}/week)
                    </FieldLabel>
                    <Input
                      id="goal-rate"
                      type="number"
                      inputMode="decimal"
                      step={0.1}
                      min={0}
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                    />
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="goal-cal">
                    Daily calories (kcal)
                  </FieldLabel>
                  <Input
                    id="goal-cal"
                    type="number"
                    inputMode="numeric"
                    value={caloriesInput}
                    onChange={(e) => setCaloriesInput(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="goal-weight">
                    Goal weight ({unit}, optional)
                  </FieldLabel>
                  <Input
                    id="goal-weight"
                    type="number"
                    inputMode="decimal"
                    placeholder="Target to reach"
                    value={goalWeightInput}
                    onChange={(e) => setGoalWeightInput(e.target.value)}
                  />
                </Field>
              </FieldGroup>
            </div>
          ) : null}

          <DrawerFooter>
            {manual ? (
              <>
                <Button onClick={requestSave} disabled={saving}>
                  {saving ? <Spinner data-icon="inline-start" /> : null}
                  Save goal
                </Button>
                <Button variant="outline" onClick={() => setManual(false)}>
                  Back
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => router.push("/onboarding")}>
                  <RotateCcw data-icon="inline-start" />
                  Redo the steps
                </Button>
                <Button variant="outline" onClick={() => setManual(true)}>
                  <Pencil data-icon="inline-start" />
                  Set manually
                </Button>
              </>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change your goal?</AlertDialogTitle>
            <AlertDialogDescription>
              {direction === "maintain"
                ? "Maintain current weight"
                : `${direction === "lose" ? "Lose" : "Gain"} ${Math.abs(Number(rateInput) || 0)} ${unit}/week`}
              {" · "}eating {Math.round(Number(caloriesInput)).toLocaleString()}{" "}
              kcal/day. This replaces your current plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={saveManual}>
              Yes, change it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
