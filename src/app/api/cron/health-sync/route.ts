import { NextRequest, NextResponse } from "next/server";
import { db, healthTokens } from "@/db";
import { backfillDays, syncWeights } from "@/lib/google-health";

export const maxDuration = 60;

// Daily: sync weight for every connected user.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connected = await db
    .select({ userId: healthTokens.userId })
    .from(healthTokens);

  let synced = 0;
  for (const { userId } of connected) {
    try {
      synced += await syncWeights(userId, await backfillDays(userId));
    } catch (err) {
      console.error(`Cron health sync failed for ${userId}`, err);
    }
  }
  return NextResponse.json({ ok: true, users: connected.length, synced });
}
