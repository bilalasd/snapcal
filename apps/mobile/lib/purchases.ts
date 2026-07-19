import Constants, { ExecutionEnvironment } from "expo-constants";

// StoreKit/Play Billing is a native module Expo Go doesn't ship. Same guard as
// apple-health.ts: detect Expo Go first, require lazily, so the module factory
// never evaluates where it would redbox.
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
type Iap = typeof import("expo-iap");
let iap: Iap | null | undefined; // undefined = not probed yet
function store(): Iap | null {
  if (iap !== undefined) return iap;
  try {
    iap = inExpoGo ? null : (require("expo-iap") as Iap);
  } catch {
    iap = null; // native module not linked
  }
  return iap ?? null;
}

// App Store Connect setup these IDs expect: one subscription group with two
// auto-renewable products, both carrying the 15-day free introductory offer
// (PRODUCT.md §6 — $4.99/mo, $49.99/yr).
export const MONTHLY_SKU = "com.loggi.app.monthly";
export const YEARLY_SKU = "com.loggi.app.yearly";
const SKUS = [MONTHLY_SKU, YEARLY_SKU];

export type Plan = { sku: string; displayPrice: string };

let connected = false;
async function connect(): Promise<Iap | null> {
  const mod = store();
  if (!mod) return null;
  if (!connected) {
    await mod.initConnection();
    connected = true;
  }
  return mod;
}

/** Localized store prices for both plans, or null when the store can't answer
 *  (Expo Go, simulator, products not yet live in App Store Connect). */
export async function loadPlans(): Promise<Plan[] | null> {
  try {
    const mod = await connect();
    if (!mod) return null;
    const products = await mod.fetchProducts({ skus: SKUS, type: "subs" });
    const plans = SKUS.flatMap((sku) => {
      const product = products?.find((p) => p.id === sku);
      return product ? [{ sku, displayPrice: product.displayPrice }] : [];
    });
    return plans.length === SKUS.length ? plans : null;
  } catch {
    return null;
  }
}

/** Present the native App Store payment sheet for a plan. Resolves true once
 *  the subscription (and its trial) is active. Throws on store errors — the
 *  caller decides which ones deserve words (user cancellation doesn't). */
export async function subscribe(sku: string): Promise<boolean> {
  const mod = await connect();
  if (!mod) return false;
  const result = await mod.requestPurchase({
    request: { apple: { sku }, google: { skus: [sku] } },
    type: "subs",
  });
  const purchases = result == null ? [] : Array.isArray(result) ? result : [result];
  for (const purchase of purchases) await mod.finishTransaction({ purchase });
  return purchases.length > 0 || (await mod.hasActiveSubscriptions(SKUS));
}

/** Re-attach a subscription bought earlier or on another device. */
export async function restore(): Promise<boolean> {
  try {
    const mod = await connect();
    if (!mod) return false;
    await mod.restorePurchases();
    return await mod.hasActiveSubscriptions(SKUS);
  } catch {
    return false;
  }
}
