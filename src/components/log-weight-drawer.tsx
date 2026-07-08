"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { fetchJson } from "@/lib/client";

const KG_PER_LB = 0.453592;

interface LogWeightDrawerProps {
  imperial: boolean;
  onLogged: () => void;
}

export function LogWeightDrawer({ imperial, onLogged }: LogWeightDrawerProps) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const unit = imperial ? "lb" : "kg";

  async function save() {
    const value = Number(weight);
    if (!value || value <= 0) {
      toast.error("Enter a valid weight");
      return;
    }
    const weightKg = imperial ? value * KG_PER_LB : value;
    setSaving(true);
    try {
      await fetchJson("/api/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weight_kg: Math.round(weightKg * 100) / 100,
          date,
        }),
      });
      toast.success("Weight logged");
      setOpen(false);
      setWeight("");
      onLogged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        Log weight
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Log your weight</DrawerTitle>
            <DrawerDescription>
              Weigh in at the same time each day (first thing in the morning is
              best) for the smoothest trend.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="lw-weight">Weight ({unit})</FieldLabel>
                <Input
                  id="lw-weight"
                  type="number"
                  inputMode="decimal"
                  autoFocus
                  placeholder={imperial ? "e.g. 176.4" : "e.g. 80.1"}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lw-date">Date</FieldLabel>
                <Input
                  id="lw-date"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
            </FieldGroup>
          </div>
          <DrawerFooter>
            <Button onClick={save} disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Save
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
