"use client";

import { useState } from "react";
import { toast } from "sonner";
import { User } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import { ACTIVITY_LEVELS, type ActivityLevel } from "@/lib/bmr";
import { fetchJson, type Goals } from "@/lib/client";

const CM_PER_IN = 2.54;

interface ProfileCardProps {
  goals: Goals;
  onGoalsSaved: (goals: Goals) => void;
}

export function ProfileCard({ goals, onGoalsSaved }: ProfileCardProps) {
  const imperial = goals.unit_system === "imperial";
  const [sex, setSex] = useState(goals.sex ?? "");
  const [age, setAge] = useState(goals.age ? String(goals.age) : "");
  const [activity, setActivity] = useState<ActivityLevel | "">(
    goals.activity_level ?? "",
  );
  const [heightCm, setHeightCm] = useState(
    goals.height_cm ? String(Math.round(goals.height_cm)) : "",
  );
  const [heightFt, setHeightFt] = useState(
    goals.height_cm ? String(Math.floor(goals.height_cm / CM_PER_IN / 12)) : "",
  );
  const [heightIn, setHeightIn] = useState(
    goals.height_cm ? String(Math.round((goals.height_cm / CM_PER_IN) % 12)) : "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    const cm = imperial
      ? (Number(heightFt || 0) * 12 + Number(heightIn || 0)) * CM_PER_IN
      : Number(heightCm || 0);
    setSaving(true);
    try {
      const saved = await fetchJson<Goals>("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...goals,
          sex: sex || null,
          age: age ? Number(age) : null,
          height_cm: cm > 0 ? Math.round(cm * 10) / 10 : null,
          activity_level: activity || null,
        }),
      });
      onGoalsSaved(saved);
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="size-4" />
          Your profile
        </CardTitle>
        <CardDescription>
          Used to estimate how many calories you burn.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="pf-sex">Sex</FieldLabel>
              <Select value={sex} onValueChange={(v) => setSex(v ?? "")}>
                <SelectTrigger id="pf-sex">
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
              <FieldLabel htmlFor="pf-age">Age</FieldLabel>
              <Input
                id="pf-age"
                type="number"
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </Field>
          </div>
          {imperial ? (
            <Field>
              <FieldLabel htmlFor="pf-ft">Height</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="pf-ft"
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
              <FieldLabel htmlFor="pf-height">Height (cm)</FieldLabel>
              <Input
                id="pf-height"
                type="number"
                inputMode="numeric"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="pf-activity">Activity level</FieldLabel>
            <Select
              value={activity}
              onValueChange={(v) => setActivity(v as ActivityLevel)}
            >
              <SelectTrigger id="pf-activity">
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
          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Save profile
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
