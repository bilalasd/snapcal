import { NextRequest, NextResponse } from "next/server";
import { generateObject, gateway } from "ai";
import { analysisSchema, NUTRITION_SYSTEM_PROMPT } from "@mealio/shared";
import { groundWithUsda } from "@/lib/food-match";

export const maxDuration = 60;

// Chosen by the model benchmark (scripts/bench-models.ts): best accuracy-per-
// dollar-per-latency on real food photos. Routed via the Vercel AI Gateway
// (needs AI_GATEWAY_API_KEY).
const MODEL = "google/gemini-3.5-flash";

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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
    return NextResponse.json({ error: "Unsupported image format" }, { status: 400 });
  }

  const content = [
    ...images.map((img) => ({
      type: "file" as const,
      data: img.data, // base64
      mediaType: img.media_type,
    })),
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
    const [items, questions] = await Promise.all([
      groundWithUsda(object.items),
      Promise.all(
        object.questions.map(async (q) => ({
          question: q.question,
          options: await Promise.all(
            q.options.map(async (opt) => ({
              label: opt.label,
              items: await groundWithUsda(opt.items),
            })),
          ),
        })),
      ),
    ]);

    return NextResponse.json({ meal_name: object.meal_name, items, questions });
  } catch (err) {
    console.error("Analyze error", err);
    return NextResponse.json(
      { error: "Couldn't analyze this input — try a clearer photo or description" },
      { status: 502 },
    );
  }
}
