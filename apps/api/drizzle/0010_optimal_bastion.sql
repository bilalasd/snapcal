CREATE INDEX "meal_items_meal_idx" ON "meal_items" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "meal_photos_meal_idx" ON "meal_photos" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "meals_user_eaten_idx" ON "meals" USING btree ("user_id","eaten_at");