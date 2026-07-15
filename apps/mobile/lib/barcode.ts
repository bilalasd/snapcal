import type { DraftItem } from "@loggi/shared";

const round1 = (n: number) => Math.round(n * 10) / 10;

// Look up a scanned barcode in Open Food Facts (free, no key). Returns a draft
// item scaled to one serving (or per-100g when no serving is given), or null if
// the product / its calories aren't found.
export async function lookupBarcode(code: string): Promise<DraftItem | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,serving_size,nutriments`;
  let body: any;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Loggi/0.1 (barcode)" } });
    if (!res.ok) return null;
    body = await res.json();
  } catch {
    return null;
  }
  if (body?.status !== 1 || !body.product) return null;

  const p = body.product;
  const n = p.nutriments ?? {};
  // Prefer per-serving values; fall back to per-100g (labeled as a 100 g portion).
  const perServing = n["energy-kcal_serving"] != null;
  const suffix = perServing ? "_serving" : "_100g";
  const val = (base: string): number => Number(n[`${base}${suffix}`] ?? 0) || 0;

  const kcal = Math.round(val("energy-kcal"));
  if (!kcal) return null; // no usable calorie data

  const name =
    [p.brands?.split(",")[0]?.trim(), p.product_name?.trim()].filter(Boolean).join(" ") ||
    "Scanned item";
  const portion = perServing ? p.serving_size || "1 serving" : "100 g";

  return {
    name,
    portion,
    calories: kcal,
    protein_g: round1(val("proteins")),
    carbs_g: round1(val("carbohydrates")),
    fat_g: round1(val("fat")),
    sat_fat_g: n[`saturated-fat${suffix}`] != null ? round1(val("saturated-fat")) : null,
    fiber_g: n[`fiber${suffix}`] != null ? round1(val("fiber")) : null,
    sugar_g: n[`sugars${suffix}`] != null ? round1(val("sugars")) : null,
    sodium_mg: n[`sodium${suffix}`] != null ? Math.round(val("sodium") * 1000) : null, // OFF sodium is grams
  };
}
