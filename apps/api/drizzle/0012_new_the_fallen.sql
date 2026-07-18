ALTER TABLE "health_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "health_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "weights" ALTER COLUMN "source" SET DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "planned" boolean DEFAULT false NOT NULL;