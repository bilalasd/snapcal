import { NextRequest, NextResponse } from "next/server";
import { backfillDays, getHealthStatus, syncWeights } from "@/lib/google-health";

export const maxDuration = 60;

const THROTTLE_MS = 60 * 60 * 1000; // at most once per hour unless forced

export async function POST(request: NextRequest) {
  const status = await getHealthStatus();
  if (!status.connected) {
    return NextResponse.json({ error: "Google Health not connected" }, { status: 400 });
  }

  const force = request.nextUrl.searchParams.get("force") === "true";
  if (
    !force &&
    status.last_synced_at &&
    Date.now() - new Date(status.last_synced_at).getTime() < THROTTLE_MS
  ) {
    return NextResponse.json({ synced: 0, throttled: true });
  }

  try {
    const synced = await syncWeights(await backfillDays());
    return NextResponse.json({ synced, throttled: false });
  } catch (err) {
    console.error("Google Health sync failed", err);
    return NextResponse.json(
      { error: "Sync failed — try reconnecting Google Health" },
      { status: 502 },
    );
  }
}
