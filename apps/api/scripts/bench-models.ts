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
import sharp from "sharp";
import { generateObject, gateway } from "ai";
import { analysisSchema, sumItems, NUTRITION_SYSTEM_PROMPT, type Analysis } from "@loggi/shared";
// ONE vision call per image scores raw (model as-is) and usda (production
// grounding). Grounding is deterministic post-processing, so no re-running the
// vision call. Set GROUND=raw to skip the DB (and the usda column) entirely.
const GROUND_ENABLED = process.env.GROUND !== "raw" && !!process.env.DATABASE_URL;

// Lazy-load the DB-backed grounding so `raw` runs need no DATABASE_URL.
type FoodMatch = typeof import("@/lib/food-match");
let _fm: FoodMatch | null = null;
async function fm(): Promise<FoodMatch> {
  if (!_fm) _fm = await import("@/lib/food-match");
  return _fm;
}

// Models to compare — edit freely. IDs are Vercel AI Gateway model IDs
// (`provider/model`); list them with:
//   curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '.data[].id'
const MODELS = [
  // — Flagships dropped for cost (~60% of a full run): uncomment to include —
  // "anthropic/claude-opus-4.8",     // ~$0.08/call
  // "google/gemini-3-pro-preview",   // ~$0.07/call
  // — Strong, not expensive —
  "openai/gpt-5.4",
  "xai/grok-4.5",
  // — Sweet spot: ship candidates —
  "anthropic/claude-sonnet-5", // current production model
  "google/gemini-3-flash",
  "google/gemini-3.5-flash",
  "openai/gpt-5-mini",
  "alibaba/qwen3-vl-instruct",
  // — Budget: cheapest "good enough"? —
  "amazon/nova-lite",
  "google/gemini-2.5-flash-lite",
  "mistral/pixtral-12b",
  "openai/gpt-4.1-nano",
  "xai/grok-4.1-fast-non-reasoning",
  "nvidia/nemotron-nano-12b-v2-vl",
  // Dropped (broken on the gateway / unreliable at structured output):
  //   mistral/pixtral-large  → "Invalid model: pixtral-large-latest"
  //   zai/glm-4.6v           → response didn't match schema
  //   meta/llama-4-maverick  → response didn't match schema
];

// ONLY=<substring> runs just the matching models (cheap smoke tests), e.g.
// ONLY=nemotron yarn bench
const ACTIVE = process.env.ONLY
  ? MODELS.filter((m) => m.includes(process.env.ONLY!))
  : MODELS;

const IMAGES_DIR = join(process.cwd(), "bench/images");
const EXPECTED_PATH = join(process.cwd(), "bench/expected.json");
const REPEAT = Math.max(1, Number(process.env.REPEAT) || 1);
const WIDTH = Number(process.env.WIDTH) || 1024; // resize width (mobile ships 1024)

// Prompt training: if bench/prompt.txt exists, use it as the system prompt so
// candidate prompts can be A/B'd without touching the shipped shared prompt.
const PROMPT_PATH = join(process.cwd(), "bench/prompt.txt");
const SYSTEM = existsSync(PROMPT_PATH) ? readFileSync(PROMPT_PATH, "utf8") : NUTRITION_SYSTEM_PROMPT;

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

interface ModeScore {
  cal: number;
  errPct: number; // NaN when no ground truth
  ms: number; // grounding time (0 for raw)
}
interface CaseResult {
  model: string;
  image: string;
  visionMs: number; // the shared vision call
  cost: number;
  raw: ModeScore;
  usda: ModeScore;
  items: string[]; // raw model identification, for eyeballing
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
  const err = (cal: number) => (expected === undefined ? NaN : absErrorPct(cal, expected));
  const score = async (
    items: Analysis["items"] | null,
    grounder?: (i: Analysis["items"]) => Promise<Analysis["items"]>,
  ): Promise<ModeScore> => {
    if (!items) return { cal: NaN, errPct: NaN, ms: NaN };
    const t = Date.now();
    const out = grounder ? await grounder(items) : items;
    const cal = sumItems(out).calories;
    return { cal, errPct: err(cal), ms: grounder ? Date.now() - t : 0 };
  };

  const start = Date.now();
  try {
    const { object, usage } = await generateObject({
      model: gateway(model),
      schema: analysisSchema,
      system: SYSTEM,
      abortSignal: AbortSignal.timeout(120_000), // don't let one hung call stall the run
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
    const visionMs = Date.now() - start;
    const raw = object.items;

    // Score raw + usda off the SAME vision output (grounding is deterministic).
    const rawScore = await score(raw);
    const usda = GROUND_ENABLED
      ? await score(raw, (i) => fm().then((m) => m.groundGroups([i]).then((g) => g[0])))
      : await score(null);

    return {
      model,
      image,
      visionMs,
      cost: computeCost(usage, pricing),
      raw: rawScore,
      usda,
      items: raw.map((i) => `${i.name} (${i.calories})`),
    };
  } catch (err) {
    const blank: ModeScore = { cal: NaN, errPct: NaN, ms: NaN };
    return {
      model,
      image,
      visionMs: Date.now() - start,
      cost: NaN,
      raw: blank,
      usda: blank,
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
    `Benchmarking ${ACTIVE.length} models × ${files.length} image(s) × ${REPEAT} run(s)` +
      `  [grounding: ${GROUND_ENABLED ? "raw + usda" : "raw only — no DATABASE_URL"}]\n`,
  );

  // Pre-process each image ONCE to match the mobile upload pipeline
  // (auto-orient, ≤1024px wide, JPEG q80) so every model sees exactly what
  // production sends — not the raw full-res file.
  const prepared = new Map<string, Buffer>();
  for (const file of files) {
    const raw = readFileSync(join(IMAGES_DIR, file));
    prepared.set(
      file,
      await sharp(raw).rotate().resize({ width: WIDTH }).jpeg({ quality: 80 }).toBuffer(),
    );
  }

  const all: CaseResult[] = [];
  for (const model of ACTIVE) {
    const priceForModel = pricing.get(model) ?? {};
    for (const file of files) {
      const bytes = prepared.get(file)!;
      const mediaType = "image/jpeg"; // always JPEG after resize
      for (let r = 0; r < REPEAT; r++) {
        const result = await runOne(model, file, bytes, mediaType, priceForModel, expected[file]);
        all.push(result);
        const cal = GROUND_ENABLED
          ? `raw ${result.raw.cal} / usda ${result.usda.cal} kcal`
          : `${result.raw.cal} kcal`;
        const tag = result.error ? `ERROR ${result.error}` : `${result.visionMs}ms  $${result.cost.toFixed(5)}  ${cal}`;
        console.log(`  ${model.padEnd(28)} ${file.padEnd(24)} ${tag}`);
      }
    }
  }

  // Aggregate per model over successful runs. Mean error for each mode.
  const meanErr = (rows: CaseResult[], mode: "raw" | "usda") => {
    const vals = rows.map((r) => r[mode].errPct).filter((v) => !Number.isNaN(v));
    return vals.length ? Number(mean(vals).toFixed(1)) : "n/a";
  };
  const summary = ACTIVE.map((model) => {
    const ok = all.filter((r) => r.model === model && !r.error);
    const errs = all.filter((r) => r.model === model && r.error).length;
    const row: Record<string, unknown> = {
      model,
      "vision ms": ok.length ? Math.round(median(ok.map((r) => r.visionMs))) : NaN,
      "$/call": ok.length ? Number(mean(ok.map((r) => r.cost)).toFixed(5)) : NaN,
      "raw err%": meanErr(ok, "raw"),
    };
    if (GROUND_ENABLED) row["usda err%"] = meanErr(ok, "usda");
    row.failures = errs;
    return row;
  });

  console.log("\n=== Summary (mean cal error % — lower is better) ===");
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
