CREATE TABLE "fitbit_tokens" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"daily_calories" integer DEFAULT 2000 NOT NULL,
	"daily_protein_g" integer DEFAULT 120 NOT NULL,
	"daily_carbs_g" integer DEFAULT 220 NOT NULL,
	"daily_fat_g" integer DEFAULT 65 NOT NULL,
	"target_rate_kg_per_wk" numeric(4, 2) DEFAULT '-0.5' NOT NULL,
	"unit_system" text DEFAULT 'metric' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"name" text NOT NULL,
	"portion" text NOT NULL,
	"calories" integer NOT NULL,
	"protein_g" numeric(6, 1) NOT NULL,
	"carbs_g" numeric(6, 1) NOT NULL,
	"fat_g" numeric(6, 1) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eaten_at" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'photo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_recaps" (
	"week_start" date PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weights" (
	"date" date PRIMARY KEY NOT NULL,
	"weight_kg" numeric(6, 2) NOT NULL,
	"source" text DEFAULT 'fitbit' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;