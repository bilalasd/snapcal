ALTER TABLE "fitbit_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "fitbit_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "weights" ALTER COLUMN "source" SET DEFAULT 'google_health';