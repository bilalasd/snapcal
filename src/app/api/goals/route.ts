import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, goals } from "@/db";

const goalsInput = z.object({
  daily_calories: z.number().int().min(500).max(10000),
  daily_protein_g: z.number().int().min(0).max(500),
  daily_carbs_g: z.number().int().min(0).max(1000),
  daily_fat_g: z.number().int().min(0).max(500),
  target_rate_kg_per_wk: z.number().min(-2).max(2),
  unit_system: z.enum(["metric", "imperial"]),
  sex: z.enum(["male", "female"]).nullable().optional(),
  age: z.number().int().min(10).max(120).nullable().optional(),
  height_cm: z.number().min(80).max(280).nullable().optional(),
  activity_level: z
    .enum(["sedentary", "light", "moderate", "active", "very_active"])
    .nullable()
    .optional(),
});

async function getOrCreateGoals() {
  const [row] = await db.select().from(goals).where(eq(goals.id, 1));
  if (row) return row;
  const [created] = await db.insert(goals).values({ id: 1 }).returning();
  return created;
}

function serialize(row: Awaited<ReturnType<typeof getOrCreateGoals>>) {
  return {
    daily_calories: row.dailyCalories,
    daily_protein_g: row.dailyProteinG,
    daily_carbs_g: row.dailyCarbsG,
    daily_fat_g: row.dailyFatG,
    target_rate_kg_per_wk: Number(row.targetRateKgPerWk),
    unit_system: row.unitSystem as "metric" | "imperial",
    sex: row.sex,
    age: row.age,
    height_cm: row.heightCm === null ? null : Number(row.heightCm),
    activity_level: row.activityLevel,
  };
}

export async function GET() {
  return NextResponse.json(serialize(await getOrCreateGoals()));
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = goalsInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid goals" }, { status: 400 });
  }
  await getOrCreateGoals();
  const [updated] = await db
    .update(goals)
    .set({
      dailyCalories: parsed.data.daily_calories,
      dailyProteinG: parsed.data.daily_protein_g,
      dailyCarbsG: parsed.data.daily_carbs_g,
      dailyFatG: parsed.data.daily_fat_g,
      targetRateKgPerWk: String(parsed.data.target_rate_kg_per_wk),
      unitSystem: parsed.data.unit_system,
      ...(parsed.data.sex !== undefined && { sex: parsed.data.sex }),
      ...(parsed.data.age !== undefined && { age: parsed.data.age }),
      ...(parsed.data.height_cm !== undefined && {
        heightCm:
          parsed.data.height_cm === null ? null : String(parsed.data.height_cm),
      }),
      ...(parsed.data.activity_level !== undefined && {
        activityLevel: parsed.data.activity_level,
      }),
    })
    .where(eq(goals.id, 1))
    .returning();
  return NextResponse.json(serialize(updated));
}
