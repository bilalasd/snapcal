CREATE TABLE "meal_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"url" text NOT NULL,
	"pathname" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN "sat_fat_g" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN "fiber_g" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN "sugar_g" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN "sodium_mg" numeric(7, 0);--> statement-breakpoint
ALTER TABLE "meal_photos" ADD CONSTRAINT "meal_photos_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;