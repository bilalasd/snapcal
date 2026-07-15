import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, meals } from "@/db";
import { attachChildren } from "@/lib/meals";
import { pickUsual } from "@loggi/shared";

/** "Your usual" — the meal habitually eaten at this time of day, if any. */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tzOffset = Number(request.nextUrl.searchParams.get("tz_offset") ?? "0");

  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), gte(meals.eatenAt, since)));

  const usualId = pickUsual(
    rows.map((m) => ({ id: m.id, name: m.name, eatenAt: m.eatenAt.toISOString() })),
    new Date(),
    tzOffset,
  );
  const winner = usualId ? rows.find((m) => m.id === usualId) : undefined;
  if (!winner) return NextResponse.json({ meal: null });

  const [meal] = await attachChildren([winner]);
  return NextResponse.json({ meal });
}
