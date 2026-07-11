/**
 * Model benchmark for the meal analyzer.
 *
 * Runs every image in bench/images/ through each model in MODELS using the SAME
 * prompt + schema the production route uses, and reports speed, cost, and
 * accuracy so you can compare models (across providers) apples-to-apples.
 *
 *   npm run bench                 # all images, one run each
 *   REPEAT=3 npm run bench        # median over 3 runs per image (steadier speed)
 *   SELFCHECK=1 npm run bench     # run the pure-helper self-check and exit
 *
 * Setup:
 *   1. Add AI_GATEWAY_API_KEY=... to .env.local (Vercel AI Gateway key — one key
 *      covers Anthropic, Google, and OpenAI).
 *   2. Drop food photos into bench/images/ (jpg/png/webp). One photo = one case.
 *   3. Optional ground truth: bench/expected.json = { "burger.jpg": 650 }.
 *      Cases without an expected value still report speed/cost; accuracy shows n/a.
 *
 * Cost uses live per-token pricing pulled from the gateway, so it stays current.
 *
 * ponytail: one image = one case. Multi-angle meals (several photos, one meal)
 * would need a small manifest — add that if/when you actually test them.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateObject, gateway } from "ai";
import { analysisSchema, sumItems, NUTRITION_SYSTEM_PROMPT } from "../src/lib/analysis";

// Models to compare — edit freely. IDs are Vercel AI Gateway model IDs
// (`provider/model`); list them with:
//   curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '.data[].id'
const MODELS = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-4.8",
  "google/gemini-3.5-flash",
  "openai/gpt-5.6-luna",
];

const IMAGES_DIR = join(process.cwd(), "bench/images");
const EXPECTED_PATH = join(process.cwd(), "bench/expected.json");
const REPEAT = Math.max(1, Number(process.env.REPEAT) || 1);

const MEDIA_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Cost in USD for one call, from gateway per-token pricing. */
export function computeCost(
  usage: { inputTokens?: number; outputTokens?: number },
  pricing: { input?: string | number; output?: string | number },
): number {
  const inTok = usage.inputTokens ?? 0;
  const outTok = usage.outputTokens ?? 0;
  return inTok * Number(pricing.input ?? 0) + outTok * Number(pricing.output ?? 0);
}

/** Absolute percent error of a predicted calorie total vs. the expected total. */
export function absErrorPct(predicted: number, expected: number): number {
  if (expected <= 0) return NaN;
  return (Math.abs(predicted - expected) / expected) * 100;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : NaN;
}

async function fetchPricing(): Promise<Map<string, { input?: string; output?: string }>> {
  const res = await fetch("https://ai-gateway.vercel.sh/v1/models");
  const body = (await res.json()) as { data: Array<{ id: string; pricing?: { input?: string; output?: string } }> };
  return new Map(body.data.map((m) => [m.id, m.pricing ?? {}]));
}

interface CaseResult {
  model: string;
  image: string;
  ms: number;
  cost: number;
  totalCalories: number;
  errorPct: number; // NaN when no ground truth
  items: string[];
  error?: string;
}

async function runOne(
  model: string,
  image: string,
  bytes: Buffer,
  mediaType: string,
  pricing: { input?: string; output?: string },
  expected: number | undefined,
): Promise<CaseResult> {
  const start = Date.now();
  try {
    const { object, usage } = await generateObject({
      model: gateway(model),
      schema: analysisSchema,
      system: NUTRITION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "file", data: bytes, mediaType },
            { type: "text", text: "Analyze this meal." },
          ],
        },
      ],
    });
    const ms = Date.now() - start;
    const totalCalories = sumItems(object.items).calories;
    return {
      model,
      image,
      ms,
      cost: computeCost(usage, pricing),
      totalCalories,
      errorPct: expected === undefined ? NaN : absErrorPct(totalCalories, expected),
      items: object.items.map((i) => `${i.name} (${i.calories})`),
    };
  } catch (err) {
    return {
      model,
      image,
      ms: Date.now() - start,
      cost: NaN,
      totalCalories: NaN,
      errorPct: NaN,
      items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  if (process.env.SELFCHECK) return selfCheck();

  if (!existsSync(IMAGES_DIR)) {
    console.error(`No ${IMAGES_DIR}. Create it and add food photos, then re-run.`);
    process.exit(1);
  }
  const files = readdirSync(IMAGES_DIR).filter((f) =>
    Object.keys(MEDIA_BY_EXT).some((ext) => f.toLowerCase().endsWith(ext)),
  );
  if (files.length === 0) {
    console.error(`No images in ${IMAGES_DIR}. Add jpg/png/webp food photos and re-run.`);
    process.exit(1);
  }
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    console.error(
      "No gateway auth. Set AI_GATEWAY_API_KEY in .env.local, or pull a fresh\n" +
        "VERCEL_OIDC_TOKEN (`vercel env pull`) — either authenticates the gateway.",
    );
    process.exit(1);
  }

  const expected: Record<string, number> = existsSync(EXPECTED_PATH)
    ? JSON.parse(readFileSync(EXPECTED_PATH, "utf8"))
    : {};
  const pricing = await fetchPricing();

  console.log(
    `Benchmarking ${MODELS.length} models × ${files.length} image(s) × ${REPEAT} run(s)…\n`,
  );

  const all: CaseResult[] = [];
  for (const model of MODELS) {
    const priceForModel = pricing.get(model) ?? {};
    for (const file of files) {
      const bytes = readFileSync(join(IMAGES_DIR, file));
      const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
      const mediaType = MEDIA_BY_EXT[ext];
      for (let r = 0; r < REPEAT; r++) {
        const result = await runOne(model, file, bytes, mediaType, priceForModel, expected[file]);
        all.push(result);
        const tag = result.error ? `ERROR ${result.error}` : `${result.ms}ms  $${result.cost.toFixed(5)}  ${result.totalCalories} kcal`;
        console.log(`  ${model.padEnd(28)} ${file.padEnd(24)} ${tag}`);
      }
    }
  }

  // Aggregate per model over successful runs.
  const summary = MODELS.map((model) => {
    const ok = all.filter((r) => r.model === model && !r.error);
    const errs = all.filter((r) => r.model === model && r.error).length;
    const withTruth = ok.filter((r) => !Number.isNaN(r.errorPct));
    return {
      model,
      "median ms": ok.length ? Math.round(median(ok.map((r) => r.ms))) : NaN,
      "avg $/call": ok.length ? Number(mean(ok.map((r) => r.cost)).toFixed(5)) : NaN,
      "cal err %": withTruth.length ? Number(mean(withTruth.map((r) => r.errorPct)).toFixed(1)) : "n/a",
      failures: errs,
    };
  });

  console.log("\n=== Summary ===");
  console.table(summary);

  const outPath = join(process.cwd(), `bench/results-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify({ summary, runs: all }, null, 2));
  console.log(`\nFull per-run detail: ${outPath}`);
}

/** ponytail: one runnable check for the cost + error math (no framework). */
function selfCheck() {
  const cost = computeCost({ inputTokens: 1000, outputTokens: 500 }, { input: "0.000002", output: "0.00001" });
  console.assert(Math.abs(cost - (0.002 + 0.005)) < 1e-9, `cost math wrong: ${cost}`);
  console.assert(absErrorPct(90, 100) === 10, "errorPct wrong");
  console.assert(Number.isNaN(absErrorPct(90, 0)), "errorPct should be NaN for expected 0");
  console.assert(median([3, 1, 2]) === 2 && median([4, 1, 2, 3]) === 2.5, "median wrong");
  console.log("selfcheck ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
