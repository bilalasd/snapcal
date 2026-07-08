"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, Ruler } from "lucide-react";
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
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { GoalCard } from "@/components/goal-card";
import { HealthCard } from "@/components/health-card";
import { fetchJson, type Goals } from "@/lib/client";

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

  async function saveUnits(unit_system: Goals["unit_system"]) {
    if (!goals) return;
    const next = { ...goals, unit_system };
    setGoals(next);
    try {
      const saved = await fetchJson<Goals>("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setGoals(saved);
    } catch {
      toast.error("Couldn't save units");
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {!goals ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <GoalCard key={`goal-${goals.unit_system}-${goals.daily_calories}-${goals.target_rate_kg_per_wk}`} goals={goals} onGoalsSaved={setGoals} />

          <Card>
            <CardHeader>
              <CardTitle>Daily targets</CardTitle>
              <CardDescription>
                Set by your plan — tweak them here if you know what you want.
              </CardDescription>
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
                <Button onClick={save} disabled={saving}>
                  {saving ? <Spinner data-icon="inline-start" /> : null}
                  Save targets
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ruler className="size-4" />
                Units
              </CardTitle>
              <CardDescription>
                Used everywhere — weights, heights, and goal rates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="units" className="sr-only">
                  Units
                </FieldLabel>
                <Select
                  value={goals.unit_system}
                  onValueChange={(v) =>
                    saveUnits(v as Goals["unit_system"])
                  }
                >
                  <SelectTrigger id="units">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="metric">
                        Metric — kg, cm
                      </SelectItem>
                      <SelectItem value="imperial">
                        Imperial — lb, ft/in
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>

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
