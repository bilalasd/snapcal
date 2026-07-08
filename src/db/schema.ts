import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const meals = pgTable("meals", {
  id: uuid("id").primaryKey().defaultRandom(),
  eatenAt: timestamp("eaten_at", { withTimezone: true }).notNull(),
  name: text("name").notNull(),
  note: text("note"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  source: text("source").notNull().default("photo"), // photo | text | favorite | copy
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mealItems = pgTable("meal_items", {
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
});

export const mealPhotos = pgTable("meal_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealId: uuid("meal_id")
    .notNull()
    .references(() => meals.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  pathname: text("pathname").notNull(), // blob pathname, for deletion
});

export const goals = pgTable("goals", {
  id: integer("id").primaryKey().default(1), // single row
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
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
});

export const weights = pgTable("weights", {
  date: date("date").primaryKey(),
  weightKg: numeric("weight_kg", { precision: 6, scale: 2 }).notNull(),
  source: text("source").notNull().default("google_health"),
});

export const healthTokens = pgTable("health_tokens", {
  id: integer("id").primaryKey().default(1), // single row
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  // Google OAuth "Testing" apps expire refresh tokens after 7 days;
  // when refresh fails we flag it so the UI can prompt a reconnect.
  needsReconnect: boolean("needs_reconnect").notNull().default(false),
});

export const weeklyRecaps = pgTable("weekly_recaps", {
  weekStart: date("week_start").primaryKey(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
