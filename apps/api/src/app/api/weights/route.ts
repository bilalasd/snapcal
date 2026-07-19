import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db, weights } from "@/db";

const weightEntry = z.object({
  weight_kg: z.number().min(25).max(400),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// Single weigh-in (manual logging, onboarding) or a bulk backfill (Apple
// Health sync — dates required and pre-deduped by the client).
const weightInput = z.union([
  weightEntry,
  z.object({
    weights: z
      .array(weightEntry.required({ date: true }))
      .min(1)
      .max(366),
  }),
]);

/** Weigh-in upsert by date. Bulk mode writes the whole backfill in one round trip. */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = weightInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid weight" }, { status: 400 });
  }

  if ("weights" in parsed.data) {
    const rows = parsed.data.weights.map((w) => ({
      userId,
      date: w.date,
      weightKg: w.weight_kg.toFixed(2),
      source: "apple_health",
    }));
    await db
      .insert(weights)
      .values(rows)
      .onConflictDoUpdate({
        target: [weights.userId, weights.date],
        set: {
          weightKg: sql`excluded.weight_kg`,
          source: sql`excluded.source`,
        },
      });
    return NextResponse.json({ imported: rows.length }, { status: 201 });
  }

  const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);
  const kg = parsed.data.weight_kg.toFixed(2);
  await db
    .insert(weights)
    .values({ userId, date, weightKg: kg, source: "manual" })
    .onConflictDoUpdate({
      target: [weights.userId, weights.date],
      set: { weightKg: kg, source: "manual" },
    });
  return NextResponse.json({ date, weight_kg: Number(kg) }, { status: 201 });
}
