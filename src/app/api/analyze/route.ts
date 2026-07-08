import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { analysisSchema } from "@/lib/analysis";
import { groundWithUsda } from "@/lib/food-match";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a nutrition estimator for a personal calorie-tracking app.
Given photos of food and/or a text description, identify each distinct food or drink and estimate its nutrition.

Rules:
- When multiple photos are provided, assume they show the SAME meal from different angles or stages (for example, one photo before the top slice of bread is placed and one after). Combine all the photos into a single assessment and list each food ONCE — never double-count an item just because it appears in more than one photo. Only treat foods as separate if the photos clearly show distinct, separate dishes.
- Use every photo together to identify what's actually in the meal. For sandwiches, burgers, wraps, and tacos, look inside for the fillings — meats, poultry, egg, cheese, vegetables, and sauces — including ones partly hidden by bread or melted cheese. Don't describe a filled sandwich as just "bread and cheese" if a photo shows meat inside it.
- If a Nutrition Facts label is visible in any photo, READ the exact numbers directly from it — calories, total fat, saturated fat, sodium, total carbohydrate, dietary fiber, total sugars, and protein. Do not estimate values you can read. Use the label's serving size and multiply by how many servings were eaten (default to one serving, or the whole package if it's a single-serve bag, unless the text says otherwise). Reading the label always beats estimating for packaged foods.
- Condiment packets shown on the plate (ketchup, mustard, mayo) may be unopened and not eaten. Include them only if a photo shows one opened or used; otherwise leave them out.
- Otherwise, estimate realistic portions from visual cues (plate size, utensils, packaging). State the portion in plain language (e.g. "1 cup cooked rice", "2 medium rotis").
- The user's text is ground truth and overrides what the photo suggests (e.g. "no butter" means no butter, "2 rotis" means 2 even if the photo shows 3).
- Use typical preparation assumptions (home-cooked with moderate oil) unless stated otherwise.
- Split combined dishes into their main components only when it helps accuracy; otherwise keep one item per dish.
- Give the meal a short, natural name (e.g. "Chicken biryani lunch").
- calories must be an integer per item; macros in grams to one decimal.
- Also estimate per item: saturated fat (g), fiber (g), sugar (g), and sodium (mg). Use typical values for the food; a rough estimate is fine.
- estimated_grams: your best estimate of the item's total weight in grams. This is used to reconcile the item against a verified nutrition database, so estimate the weight as accurately as you can.
- question: usually leave this an empty string. Set it to ONE short question ONLY when you are genuinely uncertain about something that would materially change the calorie estimate and you cannot reasonably tell from the photos or text (for example: an unclear meat, a hidden sauce, or an ambiguous portion). Do not ask about minor details. Always give your best estimate in the items regardless; the question just lets the user correct you.`;

const MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

interface AnalyzeBody {
  images?: Array<{ media_type: string; data: string }>;
  text?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as AnalyzeBody | null;
  const images = (body?.images ?? []).slice(0, 3);
  const text = (body?.text ?? "").trim();

  if (images.length === 0 && !text) {
    return NextResponse.json(
      { error: "Provide at least one photo or a description" },
      { status: 400 },
    );
  }
  if (images.some((img) => !MEDIA_TYPES.has(img.media_type) || !img.data)) {
    return NextResponse.json(
      { error: "Unsupported image format" },
      { status: 400 },
    );
  }

  const content: Anthropic.ContentBlockParam[] = [
    ...images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: {
          type: "base64",
          media_type: img.media_type as ImageMediaType,
          data: img.data,
        },
      }),
    ),
    {
      type: "text",
      text: text
        ? `Analyze this meal. User's description: ${text}`
        : "Analyze this meal.",
    },
  ];

  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(analysisSchema) },
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json(
        { error: "Couldn't analyze this input — try a clearer photo or description" },
        { status: 502 },
      );
    }

    // Ground each item against the USDA reference database where confident
    const items = await groundWithUsda(response.parsed_output.items);
    return NextResponse.json({
      meal_name: response.parsed_output.meal_name,
      items,
      question: response.parsed_output.question,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Rate limited — wait a moment and retry" },
        { status: 502 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return NextResponse.json(
        { error: "Analysis service error — try again" },
        { status: 502 },
      );
    }
    throw err;
  }
}
