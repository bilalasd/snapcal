CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fdc_id" integer NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"calories" numeric(7, 1) NOT NULL,
	"protein_g" numeric(6, 2) NOT NULL,
	"carbs_g" numeric(6, 2) NOT NULL,
	"fat_g" numeric(6, 2) NOT NULL,
	"sat_fat_g" numeric(6, 2),
	"fiber_g" numeric(6, 2),
	"sugar_g" numeric(6, 2),
	"sodium_mg" numeric(8, 1),
	CONSTRAINT "foods_fdc_id_unique" UNIQUE("fdc_id")
);
