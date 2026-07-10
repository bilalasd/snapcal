# Model benchmark

Compares models for the meal analyzer on **speed, cost, and accuracy** using the
exact production prompt + schema. Runs cross-provider via the Vercel AI Gateway.

## Setup

1. Add a gateway key to `.env.local`:
   ```
   AI_GATEWAY_API_KEY=...
   ```
   One key covers Anthropic, Google, and OpenAI. Get it from the Vercel dashboard
   → AI Gateway → API keys.
2. Drop food photos into `bench/images/` (jpg/png/webp). **One photo = one case.**
3. (Optional) Add ground-truth calorie totals so accuracy can be scored — edit
   `bench/expected.json`:
   ```json
   { "burger.jpg": 650, "salad.png": 320 }
   ```
   Cases without an expected value still report speed + cost; accuracy shows `n/a`.

## Run

```
npm run bench              # all images, one run each
REPEAT=3 npm run bench     # median speed over 3 runs per image
SELFCHECK=1 npm run bench  # verify the cost/accuracy math, then exit
```

Prints a per-model summary (median ms, avg $/call, mean calorie error %, failures)
and writes full per-run detail to `bench/results-<timestamp>.json`.

## Which models

Edit the `MODELS` array in `scripts/bench-models.ts`. List available IDs:

```
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '.data[].id'
```

Cost is computed from **live** per-token pricing pulled from the gateway, so it
stays current without a hardcoded price table.
