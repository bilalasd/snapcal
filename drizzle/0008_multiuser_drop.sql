DROP TABLE "goals" CASCADE;--> statement-breakpoint
DROP TABLE "health_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "weekly_recaps" CASCADE;--> statement-breakpoint
DROP TABLE "weights" CASCADE;--> statement-breakpoint
DELETE FROM "meals";--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "user_id" text NOT NULL;