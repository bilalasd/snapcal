import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, goals, mealItems, meals, weeklyRecaps, weights } from "@/db";
import {
  computeAuditStats,
  computeEnergyBalance,
  computeFormulaTdee,
  computeRateKgPerWeek,
  computeTrend,
  computeVerdict,
  type DayIntake,
  type WeightPoint,
} from "@loggi/shared";

export const maxDuration = 60;

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1_000;

interface AskBody {
  messages?: Array<{ role: string; content: string }>;
  tz_offset?: number;
}

function localDateOf(d: Date, tzOffsetMin: number): string {
  return new Date(d.getTime() - tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Bevi's voice, boundaries, and the shape of an answer (PRODUCT.md §4).
const SYSTEM = `You are Bevi, the beaver mascot and coach inside Loggi, a photo-first calorie tracker. You answer the user's questions about their own logged data and general nutrition.

Voice: warm, brief, plainspoken. One idea per sentence. 2-5 sentences per answer unless the question truly needs more. First person is yours ("I'm guessing on portions"). Honest about uncertainty; specific about what to do next. Never guilt, never streak-shaming, never body commentary — weight talk stays about the trend and the plan, not the person. At most one exclamation mark.

Grounding: the user's data is in the JSON block below. Answer personal questions ("my protein", "my trend") strictly from it, and say so when the data can't answer (too few logged days, no weigh-ins). General nutrition questions (food composition, timing, protein sources) you may answer from general knowledge, plainly marked as general guidance. All logged numbers are estimates — never present them as exact.

Boundaries: no medical advice, diagnoses, supplement dosing, or medication guidance — suggest a doctor or registered dietitian instead. If disordered-eating signals appear (very low intake goals, purging, fear language), decline gently and point to professional help. Never help someone eat below a safe floor.`;

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as AskBody | null;
  const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
  const tzOffset = Number(body?.tz_offset ?? 0);

  const messages = rawMessages
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.slice(0, MAX_MESSAGE_CHARS),
    }));

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Ask a question" }, { status: 400 });
  }

  // The user's context — same sources and week-frozen math as /api/trends.
  const intakeStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const weightStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [mealRows, weightRows, [goalsRow], [latestRecap]] = await Promise.all([
    db
      .select({ eatenAt: meals.eatenAt, calories: mealItems.calories, protein: mealItems.proteinG })
      .from(meals)
      .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
      .where(
        and(eq(meals.userId, userId), gte(meals.eatenAt, intakeStart), eq(meals.planned, false)),
      ),
    db
      .select()
      .from(weights)
      .where(
        and(eq(weights.userId, userId), gte(weights.date, weightStart.toISOString().slice(0, 10))),
      )
      .orderBy(weights.date),
    db.select().from(goals).where(eq(goals.userId, userId)),
    db
      .select()
      .from(weeklyRecaps)
      .where(eq(weeklyRecaps.userId, userId))
      .orderBy(desc(weeklyRecaps.weekStart))
      .limit(1),
  ]);

  const byDay = new Map<string, { calories: number; protein: number }>();
  for (const row of mealRows) {
    const day = localDateOf(row.eatenAt, tzOffset);
    const entry = byDay.get(day) ?? { calories: 0, protein: 0 };
    entry.calories += row.calories;
    entry.protein += Number(row.protein);
    byDay.set(day, entry);
  }
  const intake: DayIntake[] = Array.from(byDay.entries()).map(([date, v]) => ({
    date,
    calories: v.calories,
  }));

  const points: WeightPoint[] = weightRows.map((w) => ({
    date: w.date,
    weightKg: Number(w.weightKg),
  }));
  const trend = computeTrend(points);
  const targetRate = goalsRow ? Number(goalsRow.targetRateKgPerWk) : -0.5;

  const weekStart = mondayOf(localDateOf(new Date(), tzOffset));
  const trendAsOfWeek = trend.filter((p) => p.date < weekStart);
  const weekBalance = computeEnergyBalance(trendAsOfWeek, intake);
  const weekVerdict = computeVerdict(weekBalance, trendAsOfWeek, targetRate);
  const lastWeekTrend = trendAsOfWeek[trendAsOfWeek.length - 1];
  const formulaTdee =
    goalsRow && weekBalance && lastWeekTrend && weekVerdict.status !== "collecting"
      ? computeFormulaTdee(
          {
            sex: goalsRow.sex,
            age: goalsRow.age,
            heightCm: goalsRow.heightCm == null ? null : Number(goalsRow.heightCm),
            activityLevel: goalsRow.activityLevel,
          },
          lastWeekTrend.trendKg,
        )
      : null;

  const context = {
    today_local: localDateOf(new Date(), tzOffset),
    goals: goalsRow
      ? {
          daily_calories: goalsRow.dailyCalories,
          daily_protein_g: goalsRow.dailyProteinG,
          daily_carbs_g: goalsRow.dailyCarbsG,
          daily_fat_g: goalsRow.dailyFatG,
          target_rate_kg_per_wk: targetRate,
          adaptive_goal_on: goalsRow.adaptiveGoal,
          goal_weight_kg: goalsRow.goalWeightKg == null ? null : Number(goalsRow.goalWeightKg),
          unit_system: goalsRow.unitSystem,
        }
      : null,
    last_14_days: Array.from(byDay.entries())
      .sort()
      .map(([date, v]) => ({ date, calories: v.calories, protein_g: Math.round(v.protein) })),
    weight: {
      weigh_ins_90d: points.length,
      trend_now_kg: trend.length > 0 ? trend[trend.length - 1].trendKg : null,
      rate_kg_per_wk: computeRateKgPerWeek(trend),
    },
    this_week: {
      verdict: weekVerdict.status,
      measured_tdee_kcal: weekBalance?.tdeeKcal ?? null,
      avg_intake_kcal: weekBalance?.avgIntakeKcal ?? null,
      audit:
        formulaTdee != null && weekBalance ? computeAuditStats(weekBalance, formulaTdee) : null,
    },
    latest_monday_note: latestRecap?.content ?? null,
  };

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: `${SYSTEM}\n\nUser data:\n${JSON.stringify(context)}`,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({
        reply: "That one's outside what I can help with — a doctor or registered dietitian is the right builder for it.",
      });
    }

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!reply) {
      return NextResponse.json({ error: "That one stumped Bevi — try again" }, { status: 502 });
    }
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Ask Bevi error", err);
    return NextResponse.json({ error: "That one stumped Bevi — try again" }, { status: 502 });
  }
}
