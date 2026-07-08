import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, weights } from "@/db";

const weightInput = z.object({
  weight_kg: z.number().min(25).max(400),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Manual weigh-in (used by onboarding; Google Health sync also upserts here). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = weightInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid weight" }, { status: 400 });
  }
  const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);
  const kg = parsed.data.weight_kg.toFixed(2);
  await db
    .insert(weights)
    .values({ date, weightKg: kg, source: "manual" })
    .onConflictDoUpdate({
      target: weights.date,
      set: { weightKg: kg, source: "manual" },
    });
  return NextResponse.json({ date, weight_kg: Number(kg) }, { status: 201 });
}
