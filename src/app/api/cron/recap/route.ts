import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { eq, gte } from "drizzle-orm";
import { db, goals, mealItems, meals, weeklyRecaps, weights } from "@/db";
import {
  computeEnergyBalance,
  computeRateKgPerWeek,
  computeTrend,
  type WeightPoint,
} from "@/lib/trend";

export const maxDuration = 60;

const MIN_LOGGED_DAYS_FOR_RECAP = 4;

function assertCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStart = weekAgo.toISOString().slice(0, 10);

  // Daily intake for the week
  const mealRows = await db
    .select({ eatenAt: meals.eatenAt, calories: mealItems.calories, protein: mealItems.proteinG })
    .from(meals)
    .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(gte(meals.eatenAt, weekAgo));

  const byDay = new Map<string, { calories: number; protein: number }>();
  for (const row of mealRows) {
    const day = row.eatenAt.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { calories: 0, protein: 0 };
    entry.calories += row.calories;
    entry.protein += Number(row.protein);
    byDay.set(day, entry);
  }

  if (byDay.size < MIN_LOGGED_DAYS_FOR_RECAP) {
    await db
      .insert(weeklyRecaps)
      .values({
        weekStart,
        content: `Not enough logged days this week (${byDay.size}) for a recap — log at least ${MIN_LOGGED_DAYS_FOR_RECAP} days.`,
      })
      .onConflictDoNothing();
    return NextResponse.json({ skipped: true, loggedDays: byDay.size });
  }

  // Weight trend context
  const trendStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const weightRows = await db
    .select()
    .from(weights)
    .where(gte(weights.date, trendStart.toISOString().slice(0, 10)))
    .orderBy(weights.date);
  const points: WeightPoint[] = weightRows.map((w) => ({
    date: w.date,
    weightKg: Number(w.weightKg),
  }));
  const trend = computeTrend(points);
  const rate = computeRateKgPerWeek(trend);
  const balance = computeEnergyBalance(
    trend,
    Array.from(byDay.entries()).map(([date, v]) => ({
      date,
      calories: v.calories,
    })),
  );

  const [goalsRow] = await db.select().from(goals);

  const summaryData = {
    week_start: weekStart,
    daily_totals: Array.from(byDay.entries())
      .sort()
      .map(([date, v]) => ({
        date,
        calories: v.calories,
        protein_g: Math.round(v.protein),
      })),
    logged_days: byDay.size,
    goals: goalsRow
      ? {
          daily_calories: goalsRow.dailyCalories,
          daily_protein_g: goalsRow.dailyProteinG,
          target_rate_kg_per_wk: Number(goalsRow.targetRateKgPerWk),
        }
      : null,
    weight_trend_rate_kg_per_wk: rate,
    measured_tdee_kcal: balance?.tdeeKcal ?? null,
    actual_deficit_kcal_per_day: balance?.actualDeficitKcal ?? null,
  };

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system:
      "You write a short weekly recap for a personal calorie-tracking app. " +
      "Given the week's data, write 4-6 sentences in second person covering: average intake vs goal, " +
      "protein consistency, what the weight trend says about the deficit vs the target rate, " +
      "and exactly one concrete, actionable suggestion for next week. " +
      "Plain text only, no headers or bullet lists. Be encouraging but honest.",
    messages: [{ role: "user", content: JSON.stringify(summaryData) }],
  });

  const content = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!content) {
    return NextResponse.json({ error: "Empty recap" }, { status: 502 });
  }

  await db
    .insert(weeklyRecaps)
    .values({ weekStart, content })
    .onConflictDoUpdate({
      target: weeklyRecaps.weekStart,
      set: { content },
    });

  return NextResponse.json({ ok: true, week_start: weekStart });
}
