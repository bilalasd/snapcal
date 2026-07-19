import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte } from "drizzle-orm";
import { db, goals, mealItems, meals, weeklyRecaps, weights } from "@/db";
import {
  computeEnergyBalance,
  computeRateKgPerWeek,
  computeTrend,
  type WeightPoint,
} from "@loggi/shared";

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

  const client = new Anthropic();
  const userGoals = await db.select().from(goals);
  // Idempotent per week: a re-run (retry after a mid-loop failure, manual
  // re-trigger) only processes users still missing this week's recap instead
  // of re-billing the model for everyone already done.
  const done = new Set(
    (
      await db
        .select({ userId: weeklyRecaps.userId })
        .from(weeklyRecaps)
        .where(eq(weeklyRecaps.weekStart, weekStart))
    ).map((r) => r.userId),
  );
  const results: Array<{
    userId: string;
    skipped: boolean;
    loggedDays: number;
    error?: string;
  }> = [];

  for (const goalsRow of userGoals) {
    const userId = goalsRow.userId;
    if (done.has(userId)) continue;
    try {
      // Daily intake for the week
      const mealRows = await db
        .select({
          eatenAt: meals.eatenAt,
          calories: mealItems.calories,
          protein: mealItems.proteinG,
        })
        .from(meals)
        .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
        .where(
          and(
            eq(meals.userId, userId),
            gte(meals.eatenAt, weekAgo),
            eq(meals.planned, false), // reserved-but-unconfirmed meals aren't intake
          ),
        );

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
            userId,
            weekStart,
            content: `Bevi couldn't get a full read on last week — about ${MIN_LOGGED_DAYS_FOR_RECAP} logged days is enough for one. This week starts fresh.`,
          })
          .onConflictDoNothing();
        results.push({ userId, skipped: true, loggedDays: byDay.size });
        continue;
      }

      // Weight trend context
      const trendStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const weightRows = await db
        .select()
        .from(weights)
        .where(
          and(
            eq(weights.userId, userId),
            gte(weights.date, trendStart.toISOString().slice(0, 10)),
          ),
        )
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
        goals: {
          daily_calories: goalsRow.dailyCalories,
          daily_protein_g: goalsRow.dailyProteinG,
          target_rate_kg_per_wk: Number(goalsRow.targetRateKgPerWk),
        },
        weight_trend_rate_kg_per_wk: rate,
        measured_tdee_kcal: balance?.tdeeKcal ?? null,
        actual_deficit_kcal_per_day: balance?.actualDeficitKcal ?? null,
      };

      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        thinking: { type: "adaptive" },
        system:
          "You write a short weekly recap for a personal calorie-tracking app. " +
          "Given the week's data, write 4-6 sentences in second person covering: average intake vs goal, " +
          "protein consistency, what the weight trend says about the deficit vs the target rate, " +
          "and exactly one concrete, actionable suggestion for next week. " +
          "If the daily totals show one clear pattern (e.g. weekdays vs weekends), name it in a single " +
          "matter-of-fact sentence; if no clear pattern exists, don't invent one. " +
          "Plain text only, no headers or bullet lists. Be encouraging but honest — never guilt.",
        messages: [{ role: "user", content: JSON.stringify(summaryData) }],
      });

      const content = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (!content) throw new Error("Empty recap");

      await db
        .insert(weeklyRecaps)
        .values({ userId, weekStart, content })
        .onConflictDoNothing();

      results.push({ userId, skipped: false, loggedDays: byDay.size });
    } catch (err) {
      // One user's bad week must not strand everyone after them in the loop;
      // the idempotency skip above means the next run retries only this user.
      console.error("Recap failed for", userId, err);
      results.push({
        userId,
        skipped: true,
        loggedDays: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, week_start: weekStart, results });
}
