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
    <div className="editorial-grain flex min-h-dvh flex-col justify-between px-5 py-8">
      <div className="pt-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.svg"
          alt="SnapCal"
          className="size-16 rounded-sm shadow-[8px_8px_0_var(--primary)] ring-1 ring-foreground/15"
        />
        <p className="editorial-kicker mt-8">Private nutrition desk</p>
        <h1 className="mt-2 max-w-sm text-6xl font-black leading-[0.86] tracking-[-0.09em]">
          Snap it. Track it. Trust the trend.
        </h1>
        <p className="mt-5 max-w-xs text-sm font-semibold text-muted-foreground">
          A food log with receipts: photos, macros, weight trend, and fewer
          “wait, what did I eat?” moments.
        </p>
      </div>
      <Card className="editorial-card editorial-cut w-full">
        <CardHeader>
          <CardTitle className="text-2xl font-black tracking-[-0.06em]">
            Unlock SnapCal
          </CardTitle>
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
