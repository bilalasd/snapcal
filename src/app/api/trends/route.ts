import { NextRequest, NextResponse } from "next/server";
import { desc, eq, gte } from "drizzle-orm";
import { db, goals, meals, mealItems, weights, weeklyRecaps } from "@/db";
import {
  computeEnergyBalance,
  computeRateKgPerWeek,
  computeTrend,
  computeVerdict,
  type DayIntake,
  type WeightPoint,
} from "@/lib/trend";

export const maxDuration = 60;

function localDateOf(d: Date, tzOffsetMin: number): string {
  // Client passes getTimezoneOffset(); local time = UTC - offset
  return new Date(d.getTime() - tzOffsetMin * 60_000)
    .toISOString()
    .slice(0, 10);
}

export async function GET(request: NextRequest) {
  const daysParam = Number(request.nextUrl.searchParams.get("days") ?? "90");
  const chartDays = daysParam === 30 ? 30 : 90;
  const tzOffset = Number(request.nextUrl.searchParams.get("tz_offset") ?? "0");

  // Weights: pull enough history for a stable EMA (chart window + warm-up)
  const historyStart = new Date(
    Date.now() - (chartDays + 90) * 24 * 60 * 60 * 1000,
  );
  const weightRows = await db
    .select()
    .from(weights)
    .where(gte(weights.date, historyStart.toISOString().slice(0, 10)))
    .orderBy(weights.date);

  const points: WeightPoint[] = weightRows.map((w) => ({
    date: w.date,
    weightKg: Number(w.weightKg),
  }));
  const trend = computeTrend(points);

  // Intake by local day over the balance window (last 30 days is plenty)
  const intakeStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const mealRows = await db
    .select({
      eatenAt: meals.eatenAt,
      calories: mealItems.calories,
    })
    .from(meals)
    .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(gte(meals.eatenAt, intakeStart));

  const intakeByDay = new Map<string, number>();
  for (const row of mealRows) {
    const day = localDateOf(row.eatenAt, tzOffset);
    intakeByDay.set(day, (intakeByDay.get(day) ?? 0) + row.calories);
  }
  const intake: DayIntake[] = Array.from(intakeByDay.entries()).map(
    ([date, calories]) => ({ date, calories }),
  );

  const [goalsRow] = await db.select().from(goals);
  const targetRate = goalsRow ? Number(goalsRow.targetRateKgPerWk) : -0.5;

  const rate = computeRateKgPerWeek(trend);
  const balance = computeEnergyBalance(trend, intake);
  const verdict = computeVerdict(balance, trend, targetRate);

  const [latestRecap] = await db
    .select()
    .from(weeklyRecaps)
    .orderBy(desc(weeklyRecaps.weekStart))
    .limit(1);

  const chartStart = new Date(Date.now() - chartDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return NextResponse.json({
    weights: trend.filter((p) => p.date >= chartStart),
    rate_kg_per_week: rate,
    balance,
    verdict,
    target_rate_kg_per_wk: targetRate,
    goal_weight_kg:
      goalsRow?.goalWeightKg == null ? null : Number(goalsRow.goalWeightKg),
    unit_system: goalsRow?.unitSystem ?? "metric",
    recap: latestRecap
      ? { week_start: latestRecap.weekStart, content: latestRecap.content }
      : null,
  });
}
