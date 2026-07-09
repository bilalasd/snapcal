CREATE TABLE "goals" (
	"user_id" text PRIMARY KEY NOT NULL,
	"daily_calories" integer DEFAULT 2000 NOT NULL,
	"daily_protein_g" integer DEFAULT 120 NOT NULL,
	"daily_carbs_g" integer DEFAULT 220 NOT NULL,
	"daily_fat_g" integer DEFAULT 65 NOT NULL,
	"target_rate_kg_per_wk" numeric(4, 2) DEFAULT '-0.5' NOT NULL,
	"unit_system" text DEFAULT 'metric' NOT NULL,
	"sex" text,
	"age" integer,
	"height_cm" numeric(5, 1),
	"activity_level" text,
	"goal_weight_kg" numeric(6, 2),
	"onboarded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "health_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone,
	"needs_reconnect" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_recaps" (
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_recaps_user_id_week_start_pk" PRIMARY KEY("user_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "weights" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"weight_kg" numeric(6, 2) NOT NULL,
	"source" text DEFAULT 'google_health' NOT NULL,
	CONSTRAINT "weights_user_id_date_pk" PRIMARY KEY("user_id","date")
);
