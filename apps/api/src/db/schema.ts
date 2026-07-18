import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(), // Clerk user id
    eatenAt: timestamp("eaten_at", { withTimezone: true }).notNull(),
    name: text("name").notNull(),
    note: text("note"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    source: text("source").notNull().default("photo"), // photo | text | favorite | copy
    // Pre-logged ("I'll eat this later today"): reserves calories on Today but
    // stays out of trend/recap math until confirmed eaten.
    planned: boolean("planned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("meals_user_eaten_idx").on(t.userId, t.eatenAt)],
);

export const mealItems = pgTable(
  "meal_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealId: uuid("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    portion: text("portion").notNull(),
    calories: integer("calories").notNull(),
    proteinG: numeric("protein_g", { precision: 6, scale: 1 }).notNull(),
    carbsG: numeric("carbs_g", { precision: 6, scale: 1 }).notNull(),
    fatG: numeric("fat_g", { precision: 6, scale: 1 }).notNull(),
    // Extended nutrients for the nutrition-facts view (best-effort estimates)
    satFatG: numeric("sat_fat_g", { precision: 6, scale: 1 }),
    fiberG: numeric("fiber_g", { precision: 6, scale: 1 }),
    sugarG: numeric("sugar_g", { precision: 6, scale: 1 }),
    sodiumMg: numeric("sodium_mg", { precision: 7, scale: 0 }),
  },
  (t) => [index("meal_items_meal_idx").on(t.mealId)],
);

// USDA (FoodData Central) whole-ingredient reference, per 100 g.
export const foods = pgTable("foods", {
  id: uuid("id").primaryKey().defaultRandom(),
  fdcId: integer("fdc_id").notNull().unique(),
  description: text("description").notNull(),
  category: text("category"),
  // per 100 g
  calories: numeric("calories", { precision: 7, scale: 1 }).notNull(),
  proteinG: numeric("protein_g", { precision: 6, scale: 2 }).notNull(),
  carbsG: numeric("carbs_g", { precision: 6, scale: 2 }).notNull(),
  fatG: numeric("fat_g", { precision: 6, scale: 2 }).notNull(),
  satFatG: numeric("sat_fat_g", { precision: 6, scale: 2 }),
  fiberG: numeric("fiber_g", { precision: 6, scale: 2 }),
  sugarG: numeric("sugar_g", { precision: 6, scale: 2 }),
  sodiumMg: numeric("sodium_mg", { precision: 8, scale: 1 }),
});

export const mealPhotos = pgTable(
  "meal_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealId: uuid("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    pathname: text("pathname").notNull(), // blob pathname, for deletion
  },
  (t) => [index("meal_photos_meal_idx").on(t.mealId)],
);

export const goals = pgTable("goals", {
  userId: text("user_id").primaryKey(), // one row per Clerk user
  dailyCalories: integer("daily_calories").notNull().default(2000),
  dailyProteinG: integer("daily_protein_g").notNull().default(120),
  dailyCarbsG: integer("daily_carbs_g").notNull().default(220),
  dailyFatG: integer("daily_fat_g").notNull().default(65),
  targetRateKgPerWk: numeric("target_rate_kg_per_wk", {
    precision: 4,
    scale: 2,
  })
    .notNull()
    .default("-0.5"), // negative = lose
  unitSystem: text("unit_system").notNull().default("metric"), // metric | imperial
  // Profile for the BMR/TDEE calculator (nullable until first use)
  sex: text("sex"), // male | female
  age: integer("age"),
  heightCm: numeric("height_cm", { precision: 5, scale: 1 }),
  activityLevel: text("activity_level"), // sedentary | light | moderate | active | very_active
  goalWeightKg: numeric("goal_weight_kg", { precision: 6, scale: 2 }),
  // When true, the home-screen calorie goal is derived from the weight trend
  // (measured TDEE − deficit needed for the target rate) instead of dailyCalories.
  adaptiveGoal: boolean("adaptive_goal").notNull().default(false),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
});

export const weights = pgTable(
  "weights",
  {
    userId: text("user_id").notNull(),
    date: date("date").notNull(),
    weightKg: numeric("weight_kg", { precision: 6, scale: 2 }).notNull(),
    source: text("source").notNull().default("manual"), // manual | apple_health
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const weeklyRecaps = pgTable(
  "weekly_recaps",
  {
    userId: text("user_id").notNull(),
    weekStart: date("week_start").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekStart] })],
);
