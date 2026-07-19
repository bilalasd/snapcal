import { NextRequest, NextResponse } from "next/server";
import { generateObject, gateway } from "ai";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { analysisSchema, NUTRITION_SYSTEM_PROMPT } from "@loggi/shared";
import { groundGroups } from "@/lib/food-match";

export const maxDuration = 60;

// Chosen by the model benchmark (scripts/bench-models.ts): best accuracy-per-
// dollar-per-latency on real food photos. Routed via the Vercel AI Gateway
// (needs AI_GATEWAY_API_KEY).
const MODEL = "google/gemini-3.5-flash";

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

interface AnalyzeBody {
  images?: Array<{ media_type: string; data: string }>;
  text?: string;
  // Empty-plate correction: the already-logged items this photo is the
  // aftermath of. Present → respond with per-item eaten fractions instead.
  leftovers_of?: Array<{ name: string; portion: string }>;
}

const leftoversSchema = z.object({
  // Fraction of each numbered item actually eaten, same order as the input.
  fractions: z.array(z.number().min(0).max(1)),
});

export async function POST(request: NextRequest) {
  // Defense in depth: the proxy middleware already gates this, but every other
  // route re-checks in-handler so auth never rides on the matcher alone.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
    return NextResponse.json({ error: "Unsupported image format" }, { status: 400 });
  }

  const imageParts = images.map((img) => ({
    type: "file" as const,
    data: img.data, // base64
    mediaType: img.media_type,
  }));

  // Leftovers mode: given the plate-after photo, how much of each item was eaten?
  const leftovers = body?.leftovers_of ?? [];
  if (leftovers.length > 0 && images.length > 0) {
    const list = leftovers.map((it, i) => `${i + 1}. ${it.name} — ${it.portion}`).join("\n");
    try {
      const { object } = await generateObject({
        model: gateway(MODEL),
        schema: leftoversSchema,
        system:
          "You estimate leftovers for a calorie-tracking app. The user logged a meal, then " +
          "photographed the plate after eating. For each numbered logged item, return the fraction " +
          "actually eaten: 1 = finished, 0.5 = half eaten, 0 = untouched. If an item is not " +
          "visible or you cannot tell, return 1 (assume eaten). Return exactly one fraction per item, in order.",
        maxOutputTokens: 1024,
        messages: [
          {
            role: "user",
            content: [...imageParts, { type: "text" as const, text: `Logged items:\n${list}` }],
          },
        ],
      });
      // Defensive alignment: pad missing fractions with 1 (assume eaten).
      const fractions = leftovers.map((_, i) => object.fractions[i] ?? 1);
      return NextResponse.json({ fractions });
    } catch (err) {
      console.error("Leftovers analyze error", err);
      return NextResponse.json(
        { error: "Couldn't read the plate — try a clearer photo" },
        { status: 502 },
      );
    }
  }

  const content = [
    ...imageParts,
    {
      type: "text" as const,
      text: text ? `Analyze this meal. User's description: ${text}` : "Analyze this meal.",
    },
  ];

  try {
    const { object } = await generateObject({
      model: gateway(MODEL),
      schema: analysisSchema,
      system: NUTRITION_SYSTEM_PROMPT,
      maxOutputTokens: 8192,
      messages: [{ role: "user", content }],
    });

    // Ground each item against the USDA reference database where confident.
    // Every question's options carry their own full item lists, so ground those
    // too — a single tapped answer applies its items directly with no re-call.
    // One groundGroups call = one db round trip for the whole response.
    const [items, ...optionGroups] = await groundGroups([
      object.items,
      ...object.questions.flatMap((q) => q.options.map((opt) => opt.items)),
    ]);
    let cursor = 0;
    const questions = object.questions.map((q) => ({
      question: q.question,
      options: q.options.map((opt) => ({
        label: opt.label,
        items: optionGroups[cursor++],
      })),
    }));

    return NextResponse.json({ meal_name: object.meal_name, items, questions });
  } catch (err) {
    console.error("Analyze error", err);
    return NextResponse.json(
      { error: "Couldn't analyze this input — try a clearer photo or description" },
      { status: 502 },
    );
  }
}
