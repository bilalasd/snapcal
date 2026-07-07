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

interface HealthStatus {
  connected: boolean;
  needs_reconnect: boolean;
  last_synced_at: string | null;
}

const DISCONNECTED: HealthStatus = {
  connected: false,
  needs_reconnect: false,
  last_synced_at: null,
};

export function HealthCard() {
  const [status, setStatus] = useState<HealthStatus | null>(null);

  useEffect(() => {
    fetch("/api/health/status")
      .then((r) => (r.ok ? r.json() : DISCONNECTED))
      .then(setStatus)
      .catch(() => setStatus(DISCONNECTED));
  }, []);

  async function disconnect() {
    const res = await fetch("/api/health/disconnect", { method: "POST" });
    if (res.ok) {
      setStatus(DISCONNECTED);
      toast.success("Google Health disconnected");
    }
  }

  const description = status?.connected
    ? status.last_synced_at
      ? `Connected · last synced ${new Date(status.last_synced_at).toLocaleString()}`
      : "Connected"
    : status?.needs_reconnect
      ? "Connection expired (Google testing apps need a weekly reconnect) — tap to reconnect."
      : "Connect to pull your Fitbit weight for trend analysis.";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4" />
          Google Health (Fitbit)
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        {status?.connected ? (
          <Button variant="outline" onClick={disconnect}>
            Disconnect
          </Button>
        ) : (
          <Button
            render={<a href="/api/health/connect" />}
            disabled={status === null}
          >
            {status?.needs_reconnect ? "Reconnect" : "Connect Google Health"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
