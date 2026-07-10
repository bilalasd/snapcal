"use client";

import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";
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
import { ProfileCard } from "@/components/profile-card";
import { ThemeCard } from "@/components/theme-card";
import { gramsFromPercents, macroPercents } from "@/lib/bmr";
import { HealthCard } from "@/components/health-card";
import { fetchJson, type Goals } from "@/lib/client";

export default function SettingsPage() {
  const { signOut } = useClerk();
  const [goals, setGoals] = useState<Goals | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJson<Goals>("/api/goals").then(setGoals).catch(() => {});
  }, []);

  function update(patch: Partial<Goals>) {
    setGoals((g) => (g ? { ...g, ...patch } : g));
  }

  const pcts = goals
    ? macroPercents(goals.daily_calories, {
        protein_g: goals.daily_protein_g,
        carbs_g: goals.daily_carbs_g,
        fat_g: goals.daily_fat_g,
      })
    : { protein_pct: 0, carbs_pct: 0, fat_pct: 0 };
  const pctTotal = pcts.protein_pct + pcts.carbs_pct + pcts.fat_pct;

  function updatePct(key: keyof typeof pcts, value: number) {
    if (!goals) return;
    const next = { ...pcts, [key]: Math.max(0, Math.min(100, value)) };
    const grams = gramsFromPercents(goals.daily_calories, next);
    update({
      daily_protein_g: grams.protein_g,
      daily_carbs_g: grams.carbs_g,
      daily_fat_g: grams.fat_g,
    });
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
    await signOut({ redirectUrl: "/sign-in" });
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <p className="editorial-kicker">Control room</p>
        <h1 className="editorial-headline mt-1">Settings</h1>
      </section>

      {!goals ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <GoalCard key={`goal-${goals.unit_system}-${goals.daily_calories}-${goals.target_rate_kg_per_wk}`} goals={goals} onGoalsSaved={setGoals} />

          <Card className="editorial-card editorial-cut">
            <CardHeader>
              <CardTitle className="text-2xl font-black tracking-[-0.06em]">
                Daily targets
              </CardTitle>
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
                    onChange={(e) => {
                      const calories = Number(e.target.value);
                      const grams = gramsFromPercents(calories, pcts);
                      update({
                        daily_calories: calories,
                        daily_protein_g: grams.protein_g,
                        daily_carbs_g: grams.carbs_g,
                        daily_fat_g: grams.fat_g,
                      });
                    }}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ["protein_pct", "Protein %"],
                      ["carbs_pct", "Carbs %"],
                      ["fat_pct", "Fat %"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key}>
                      <FieldLabel htmlFor={key}>{label}</FieldLabel>
                      <Input
                        id={key}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        value={pcts[key]}
                        onChange={(e) => updatePct(key, Number(e.target.value))}
                      />
                    </Field>
                  ))}
                </div>
                <p
                  className={
                    pctTotal === 100
                      ? "text-muted-foreground text-xs"
                      : "text-destructive text-xs"
                  }
                >
                  {pctTotal === 100
                    ? `= ${goals.daily_protein_g}g protein · ${goals.daily_carbs_g}g carbs · ${goals.daily_fat_g}g fat`
                    : `Percentages add up to ${pctTotal}% — they need to total 100%.`}
                </p>
                <Button onClick={save} disabled={saving || pctTotal !== 100}>
                  {saving ? <Spinner data-icon="inline-start" /> : null}
                  Save targets
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card className="editorial-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl font-black tracking-[-0.06em]">
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

          <ProfileCard goals={goals} onGoalsSaved={setGoals} />

          <ThemeCard />

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
