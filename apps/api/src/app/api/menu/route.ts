import { NextRequest, NextResponse } from "next/server";
import { generateObject, gateway } from "ai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";

export const maxDuration = 60;

// Same pipeline as /api/analyze (bench-picked model via the AI Gateway).
const MODEL = "google/gemini-3.5-flash";

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DISHES = 20;

interface MenuBody {
  image?: { media_type: string; data: string };
  remaining_kcal?: number;
  daily_goal_kcal?: number;
}

const menuSchema = z.object({
  is_menu: z
    .boolean()
    .describe("true only when the photo shows a restaurant menu or menu board"),
  dishes: z
    .array(
      z.object({
        name: z.string(),
        portion_note: z
          .string()
          .describe("assumed portion in plain language, e.g. 'standard restaurant plate'"),
        calories: z.number(),
        protein_g: z.number(),
        carbs_g: z.number(),
        fat_g: z.number(),
      }),
    )
    .max(MAX_DISHES),
});

export type MenuFit = "fits" | "tight" | "over";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as MenuBody | null;
  const image = body?.image;
  const remaining = Math.max(0, Math.round(Number(body?.remaining_kcal ?? 0)));

  if (!image?.data || !MEDIA_TYPES.has(image.media_type)) {
    return NextResponse.json({ error: "Send a menu photo" }, { status: 400 });
  }

  try {
    const { object } = await generateObject({
      model: gateway(MODEL),
      schema: menuSchema,
      maxOutputTokens: 4096,
      system:
        "You read restaurant menu photos for a calorie-tracking app. Extract up to " +
        `${MAX_DISHES} distinct dishes (entrées, mains, large plates first; skip drinks ` +
        "and condiments unless the menu is mostly drinks). For each dish estimate the " +
        "nutrition of a TYPICAL restaurant serving: calories, protein, carbs, fat, in " +
        "grams, as integers. State the assumed portion plainly in portion_note. If the " +
        "photo is not a menu (a plate of food, a receipt, anything else), return " +
        "is_menu: false with an empty dishes array.",
      messages: [
        {
          role: "user",
          content: [
            { type: "file" as const, data: image.data, mediaType: image.media_type },
            { type: "text" as const, text: "Extract the dishes from this menu." },
          ],
        },
      ],
    });

    // Honesty bands, not false precision: a dish "fits" only with clear room.
    const dishes = object.dishes.map((d) => ({
      ...d,
      calories: Math.round(d.calories),
      protein_g: Math.round(d.protein_g),
      carbs_g: Math.round(d.carbs_g),
      fat_g: Math.round(d.fat_g),
      fit: (d.calories <= remaining * 0.75
        ? "fits"
        : d.calories <= remaining
          ? "tight"
          : "over") as MenuFit,
    }));

    return NextResponse.json({
      is_menu: object.is_menu,
      remaining_kcal: remaining,
      dishes,
    });
  } catch (err) {
    console.error("Menu scout error", err);
    return NextResponse.json(
      { error: "Couldn't read that menu — try a straighter, closer shot" },
      { status: 502 },
    );
  }
}
