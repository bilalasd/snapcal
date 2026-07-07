"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface FitbitStatus {
  connected: boolean;
  last_synced_at: string | null;
}

export function FitbitCard() {
  const [status, setStatus] = useState<FitbitStatus | null>(null);

  useEffect(() => {
    fetch("/api/fitbit/status")
      .then((r) => (r.ok ? r.json() : { connected: false, last_synced_at: null }))
      .then(setStatus)
      .catch(() => setStatus({ connected: false, last_synced_at: null }));
  }, []);

  async function disconnect() {
    const res = await fetch("/api/fitbit/disconnect", { method: "POST" });
    if (res.ok) {
      setStatus({ connected: false, last_synced_at: null });
      toast.success("Fitbit disconnected");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4" />
          Fitbit
        </CardTitle>
        <CardDescription>
          {status?.connected
            ? status.last_synced_at
              ? `Connected · last synced ${new Date(status.last_synced_at).toLocaleString()}`
              : "Connected"
            : "Connect to pull your weight for trend analysis."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status?.connected ? (
          <Button variant="outline" onClick={disconnect}>
            Disconnect
          </Button>
        ) : (
          <Button
            render={<a href="/api/fitbit/connect" />}
            disabled={status === null}
          >
            Connect Fitbit
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
