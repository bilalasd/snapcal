import { NextRequest, NextResponse } from "next/server";
import { backfillDays, getFitbitStatus, syncWeights } from "@/lib/fitbit";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getFitbitStatus();
  if (!status.connected) {
    return NextResponse.json({ skipped: true, reason: "not connected" });
  }

  try {
    const synced = await syncWeights(await backfillDays());
    return NextResponse.json({ ok: true, synced });
  } catch (err) {
    console.error("Cron Fitbit sync failed", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 502 });
  }
}
