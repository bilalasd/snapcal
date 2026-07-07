"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    }).catch(() => null);
    if (res?.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setError(res ? "Wrong passcode" : "Network error — try again");
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="SnapCal" className="size-16 rounded-2xl shadow-lg shadow-primary/20" />
        <h1 className="text-2xl font-bold tracking-tight">SnapCal</h1>
        <p className="text-muted-foreground text-sm">
          Snap it. Track it. Trust the trend.
        </p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="passcode">Passcode</FieldLabel>
                <Input
                  id="passcode"
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  aria-invalid={error ? true : undefined}
                />
                {error ? (
                  <p className="text-destructive text-sm">{error}</p>
                ) : null}
              </Field>
              <Button type="submit" disabled={pending || !passcode}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                Unlock
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
