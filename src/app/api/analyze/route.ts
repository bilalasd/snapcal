import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { analysisSchema, NUTRITION_SYSTEM_PROMPT } from "@/lib/analysis";
import { groundWithUsda } from "@/lib/food-match";

export const maxDuration = 60;

const SYSTEM_PROMPT = NUTRITION_SYSTEM_PROMPT;

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
      model: "claude-sonnet-5",
      max_tokens: 4096,
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

    // Ground each item against the USDA reference database where confident.
    // Options carry their own full item lists, so ground those too — tapping an
    // option applies its items directly with no re-analysis.
    const [items, options] = await Promise.all([
      groundWithUsda(response.parsed_output.items),
      Promise.all(
        response.parsed_output.options.map(async (opt) => ({
          label: opt.label,
          items: await groundWithUsda(opt.items),
        })),
      ),
    ]);
    return NextResponse.json({
      meal_name: response.parsed_output.meal_name,
      items,
      question: response.parsed_output.question,
      options,
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
