"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, RotateCcw, Target } from "lucide-react";
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

  const summary =
    goals.target_rate_kg_per_wk === 0
      ? "Maintain current weight"
      : `${goals.target_rate_kg_per_wk < 0 ? "Lose" : "Gain"} ${
          Math.round(Math.abs(displayRate) * 100) / 100
        } ${unit}/week`;

  async function saveManual() {
    const magnitude = Math.abs(Number(rateInput) || 0);
    const displayValue =
      direction === "maintain"
        ? 0
        : direction === "lose"
          ? -magnitude
          : magnitude;
    const rateKg = imperial ? displayValue * KG_PER_LB : displayValue;
    const calories = Math.round(Number(caloriesInput));
    if (calories < 500) {
      toast.error("Daily calories look too low");
      return;
    }
    setSaving(true);
    try {
      const saved = await fetchJson<Goals>("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...goals,
          daily_calories: calories,
          target_rate_kg_per_wk: Math.round(rateKg * 100) / 100,
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
              </FieldGroup>
            </div>
          ) : null}

          <DrawerFooter>
            {manual ? (
              <>
                <Button onClick={saveManual} disabled={saving}>
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
    </>
  );
}
