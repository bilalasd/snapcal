import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import {
  db,
  goals,
  mealPhotos,
  meals,
  weeklyRecaps,
  weights,
} from "@/db";
import { attachChildren } from "@/lib/meals";

/** Export everything the app knows about the signed-in user as one JSON. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [mealRows, [goalsRow], weightRows, recapRows] = await Promise.all([
    db.select().from(meals).where(eq(meals.userId, userId)),
    db.select().from(goals).where(eq(goals.userId, userId)),
    db.select().from(weights).where(eq(weights.userId, userId)),
    db.select().from(weeklyRecaps).where(eq(weeklyRecaps.userId, userId)),
  ]);

  return NextResponse.json({
    exported_at: new Date().toISOString(),
    goals: goalsRow ?? null,
    meals: await attachChildren(mealRows),
    weights: weightRows,
    weekly_recaps: recapRows,
  });
}

/** Delete the signed-in user's account: all app data, then the Clerk user. */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mealIds = (
    await db.select({ id: meals.id }).from(meals).where(eq(meals.userId, userId))
  ).map((m) => m.id);
  if (mealIds.length > 0) {
    const photos = await db
      .select()
      .from(mealPhotos)
      .where(inArray(mealPhotos.mealId, mealIds));
    if (photos.length > 0) {
      await del(photos.map((p) => p.url)).catch((err) =>
        console.error("Blob cleanup failed", err),
      );
    }
  }

  await db.delete(meals).where(eq(meals.userId, userId)); // cascades items + photos
  await db.delete(goals).where(eq(goals.userId, userId));
  await db.delete(weights).where(eq(weights.userId, userId));
  await db.delete(weeklyRecaps).where(eq(weeklyRecaps.userId, userId));

  await (await clerkClient()).users.deleteUser(userId);
  return NextResponse.json({ ok: true });
}
