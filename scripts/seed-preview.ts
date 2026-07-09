/**
 * Seeds one Clerk test user with a realistic history so every screen renders
 * with content: completed onboarding goals, ~10 days of meals, ~9 weeks of
 * weigh-ins (trending down), and last week's recap.
 *
 * Run: npm run seed:preview   (tsx --env-file=.env.local scripts/seed-preview.ts)
 * Idempotent — wipes this user's rows first.
 */
import { createClerkClient } from "@clerk/backend";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const { goals, meals, mealItems, weights, weeklyRecaps } = schema;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} (add it to .env.local)`);
  return v;
}

const db = drizzle(neon(need("DATABASE_URL")), { schema });
const clerk = createClerkClient({ secretKey: need("CLERK_SECRET_KEY") });
const email = need("E2E_CLERK_USER_EMAIL");

const ymd = (d: Date) => d.toISOString().slice(0, 10);
function at(daysAgo: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// A small rotating menu so days look varied. Macros are realistic-ish.
type Item = {
  name: string;
  portion: string;
  calories: number;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG?: string;
  sugarG?: string;
};
type Dish = { name: string; items: Item[] };

const BREAKFASTS: Dish[] = [
  {
    name: "Oats & berries",
    items: [
      { name: "Rolled oats", portion: "60 g", calories: 228, proteinG: "8.0", carbsG: "40.0", fatG: "4.0", fiberG: "6.0", sugarG: "1.0" },
      { name: "Mixed berries", portion: "100 g", calories: 57, proteinG: "0.7", carbsG: "14.0", fatG: "0.3", fiberG: "2.4", sugarG: "10.0" },
      { name: "Greek yogurt", portion: "120 g", calories: 88, proteinG: "12.0", carbsG: "4.5", fatG: "2.4" },
    ],
  },
  {
    name: "Eggs & toast",
    items: [
      { name: "Scrambled eggs", portion: "2 eggs", calories: 182, proteinG: "12.6", carbsG: "1.2", fatG: "13.8" },
      { name: "Wholegrain toast", portion: "2 slices", calories: 160, proteinG: "8.0", carbsG: "28.0", fatG: "2.0", fiberG: "5.0" },
    ],
  },
];

const LUNCHES: Dish[] = [
  {
    name: "Chicken rice bowl",
    items: [
      { name: "Grilled chicken breast", portion: "150 g", calories: 248, proteinG: "46.5", carbsG: "0.0", fatG: "5.4" },
      { name: "Jasmine rice", portion: "180 g cooked", calories: 234, proteinG: "4.3", carbsG: "51.0", fatG: "0.4" },
      { name: "Steamed broccoli", portion: "100 g", calories: 35, proteinG: "2.4", carbsG: "7.0", fatG: "0.4", fiberG: "3.3" },
    ],
  },
  {
    name: "Dal & roti",
    items: [
      { name: "Toor dal", portion: "1 bowl", calories: 198, proteinG: "11.0", carbsG: "30.0", fatG: "3.5", fiberG: "8.0" },
      { name: "Roti", portion: "2 pieces", calories: 240, proteinG: "7.0", carbsG: "44.0", fatG: "4.0", fiberG: "6.0" },
    ],
  },
];

const DINNERS: Dish[] = [
  {
    name: "Salmon & greens",
    items: [
      { name: "Baked salmon", portion: "140 g", calories: 280, proteinG: "39.0", carbsG: "0.0", fatG: "13.0" },
      { name: "Roasted potatoes", portion: "150 g", calories: 174, proteinG: "3.0", carbsG: "34.0", fatG: "3.0", fiberG: "3.5" },
      { name: "Mixed salad", portion: "1 bowl", calories: 60, proteinG: "1.5", carbsG: "6.0", fatG: "3.5", fiberG: "2.0" },
    ],
  },
  {
    name: "Beef stir-fry",
    items: [
      { name: "Lean beef strips", portion: "130 g", calories: 267, proteinG: "36.0", carbsG: "0.0", fatG: "13.0" },
      { name: "Stir-fry veg", portion: "200 g", calories: 90, proteinG: "4.0", carbsG: "16.0", fatG: "1.5", fiberG: "5.0" },
      { name: "Noodles", portion: "120 g cooked", calories: 190, proteinG: "6.0", carbsG: "38.0", fatG: "1.5" },
    ],
  },
];

async function main() {
  const list = await clerk.users.getUserList({ emailAddress: [email] });
  const user = list.data[0];
  if (!user) {
    throw new Error(
      `No Clerk user with email ${email}. Create the test user in your Clerk dev instance first.`,
    );
  }
  const userId = user.id;
  console.log(`Seeding for Clerk user ${userId} (${email})`);

  // Wipe (meals cascade to items + photos).
  await db.delete(meals).where(eq(meals.userId, userId));
  await db.delete(weights).where(eq(weights.userId, userId));
  await db.delete(goals).where(eq(goals.userId, userId));
  await db.delete(weeklyRecaps).where(eq(weeklyRecaps.userId, userId));

  // Goals — onboarded so the app doesn't redirect to /onboarding.
  await db.insert(goals).values({
    userId,
    dailyCalories: 2100,
    dailyProteinG: 160,
    dailyCarbsG: 210,
    dailyFatG: 60,
    targetRateKgPerWk: "-0.5",
    unitSystem: "metric",
    sex: "male",
    age: 32,
    heightCm: "178.0",
    activityLevel: "moderate",
    goalWeightKg: "78.00",
    onboardedAt: new Date(),
  });

  // Meals — last 10 days, 3/day, rotating menu. One favorite.
  let favoriteAssigned = false;
  for (let d = 0; d < 10; d++) {
    const plan: Array<{ dish: Dish; hour: number }> = [
      { dish: BREAKFASTS[d % BREAKFASTS.length], hour: 8 },
      { dish: LUNCHES[d % LUNCHES.length], hour: 13 },
      { dish: DINNERS[d % DINNERS.length], hour: 20 },
    ];
    for (const { dish, hour } of plan) {
      const isFavorite = !favoriteAssigned && hour === 13 && d === 0;
      if (isFavorite) favoriteAssigned = true;
      const [meal] = await db
        .insert(meals)
        .values({
          userId,
          eatenAt: at(d, hour),
          name: dish.name,
          isFavorite,
          source: "photo",
        })
        .returning();
      await db.insert(mealItems).values(
        dish.items.map((it) => ({
          mealId: meal.id,
          name: it.name,
          portion: it.portion,
          calories: it.calories,
          proteinG: it.proteinG,
          carbsG: it.carbsG,
          fatG: it.fatG,
          fiberG: it.fiberG ?? null,
          sugarG: it.sugarG ?? null,
        })),
      );
    }
  }

  // Weights — 63 daily weigh-ins, 85.0 → ~82.0 kg with gentle noise.
  const start = 85.0;
  const rows = [];
  for (let d = 63; d >= 0; d--) {
    const t = (63 - d) / 63;
    const trend = start - 3.0 * t; // ~-0.33 kg/week
    const noise = Math.sin(d * 1.3) * 0.25;
    rows.push({
      userId,
      date: ymd(at(d, 7)),
      weightKg: (Math.round((trend + noise) * 100) / 100).toFixed(2),
      source: "manual",
    });
  }
  await db.insert(weights).values(rows);

  // Weekly recap — start of last week.
  const weekStart = at(new Date().getDay() + 7, 0);
  await db.insert(weeklyRecaps).values({
    userId,
    weekStart: ymd(weekStart),
    content:
      "Solid week. You averaged 2,040 kcal against a 2,100 target and logged all 7 days. Your trend weight dropped 0.3 kg — right on pace for your -0.5 kg/week goal. Protein held around 155 g/day, which is protecting muscle while you cut. Keep the dinners lean and you'll hit your goal weight comfortably.",
  });

  console.log("Seed complete: goals, 30 meals, 64 weigh-ins, 1 recap.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
