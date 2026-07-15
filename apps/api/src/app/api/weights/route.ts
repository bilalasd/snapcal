import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db, weights } from "@/db";

const weightInput = z.object({
  weight_kg: z.number().min(25).max(400),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Weigh-in upsert by date (manual logging, onboarding, and Apple Health sync). */
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
