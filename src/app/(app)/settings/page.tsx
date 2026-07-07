"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { CalculatorCard } from "@/components/calculator-card";
import { HealthCard } from "@/components/health-card";
import { fetchJson, type Goals } from "@/lib/client";

const KG_PER_LB = 0.453592;

export default function SettingsPage() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goals | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJson<Goals>("/api/goals").then(setGoals).catch(() => {});
  }, []);

  function update(patch: Partial<Goals>) {
    setGoals((g) => (g ? { ...g, ...patch } : g));
  }

  async function save() {
    if (!goals) return;
    setSaving(true);
    try {
      const saved = await fetchJson<Goals>("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goals),
      });
      setGoals(saved);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  const imperial = goals?.unit_system === "imperial";
  // Display rate in the user's units; store in kg/week
  const displayRate = goals
    ? imperial
      ? goals.target_rate_kg_per_wk / KG_PER_LB
      : goals.target_rate_kg_per_wk
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {!goals ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Daily goals</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="cal">Calories (kcal)</FieldLabel>
                  <Input
                    id="cal"
                    type="number"
                    inputMode="numeric"
                    value={goals.daily_calories}
                    onChange={(e) =>
                      update({ daily_calories: Number(e.target.value) })
                    }
                  />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ["daily_protein_g", "Protein (g)"],
                      ["daily_carbs_g", "Carbs (g)"],
                      ["daily_fat_g", "Fat (g)"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key}>
                      <FieldLabel htmlFor={key}>{label}</FieldLabel>
                      <Input
                        id={key}
                        type="number"
                        inputMode="numeric"
                        value={goals[key]}
                        onChange={(e) =>
                          update({ [key]: Number(e.target.value) })
                        }
                      />
                    </Field>
                  ))}
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Weight goal</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="units">Units</FieldLabel>
                  <Select
                    value={goals.unit_system}
                    onValueChange={(v) =>
                      update({ unit_system: v as Goals["unit_system"] })
                    }
                  >
                    <SelectTrigger id="units">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="metric">kg</SelectItem>
                        <SelectItem value="imperial">lbs</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="rate">
                    Target rate ({imperial ? "lbs" : "kg"}/week, negative =
                    lose)
                  </FieldLabel>
                  <Input
                    id="rate"
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    value={Math.round(displayRate * 100) / 100}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      update({
                        target_rate_kg_per_wk: imperial ? v * KG_PER_LB : v,
                      });
                    }}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Save
          </Button>

          <CalculatorCard
            key={goals.unit_system}
            goals={goals}
            onGoalsSaved={setGoals}
          />

          <HealthCard />

          <Button variant="outline" onClick={logout}>
            <LogOut data-icon="inline-start" />
            Log out
          </Button>
        </>
      )}
    </div>
  );
}
