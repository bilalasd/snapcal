import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { localDateString } from "@loggi/shared";
import { fetchJson } from "./api";

// HealthKit is a native module that Expo Go doesn't ship. The require must not
// even *evaluate* there — Metro reports module-factory throws as fatal in dev,
// so a try/catch alone still redboxes. Detect Expo Go first, require lazily.
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
type HealthKit = typeof import("@kingstinct/react-native-healthkit");
let hk: HealthKit | null | undefined; // undefined = not probed yet
function healthkit(): HealthKit | null {
  if (hk !== undefined) return hk;
  try {
    hk =
      Platform.OS === "ios" && !inExpoGo
        ? (require("@kingstinct/react-native-healthkit") as HealthKit)
        : null;
    if (hk && !hk.isHealthDataAvailable()) hk = null;
  } catch {
    hk = null; // native module not linked
  }
  return hk ?? null;
}

const ENABLED_KEY = "appleHealth.enabled";
const ANCHOR_KEY = "appleHealth.anchor";
const LAST_SYNC_KEY = "appleHealth.lastSync";
const BACKFILL_DAYS = 90; // matches the trend engine's window

export const appleHealthSupported = (): boolean => healthkit() !== null;

export const isAppleHealthEnabled = async (): Promise<boolean> =>
  (await AsyncStorage.getItem(ENABLED_KEY)) === "1";

/** When the last successful sync finished, or null if never. */
export async function lastAppleHealthSync(): Promise<Date | null> {
  const v = await AsyncStorage.getItem(LAST_SYNC_KEY);
  return v ? new Date(v) : null;
}

/** Show the HealthKit permission sheet and, if granted, run the first sync. */
export async function connectAppleHealth(): Promise<boolean> {
  const mod = healthkit();
  if (!mod) return false;
  const ok = await mod.requestAuthorization({ toRead: ["HKQuantityTypeIdentifierBodyMass"] });
  if (!ok) return false;
  await AsyncStorage.setItem(ENABLED_KEY, "1");
  await syncAppleHealth().catch(() => {}); // first pull; later focuses retry
  return true;
}

/** Stop syncing. Read permission itself can only be revoked in the Health app. */
export async function disconnectAppleHealth(): Promise<void> {
  await AsyncStorage.multiRemove([ENABLED_KEY, ANCHOR_KEY, LAST_SYNC_KEY]);
}

/** Push new HealthKit weigh-ins to the API. Incremental via HealthKit's query
 *  anchor, so it's cheap to call on every Weight-tab focus. */
export async function syncAppleHealth(): Promise<boolean> {
  const mod = healthkit();
  if (!mod || !(await isAppleHealthEnabled())) return false;

  const anchor = (await AsyncStorage.getItem(ANCHOR_KEY)) ?? undefined;
  const { samples, newAnchor } = await mod.queryQuantitySamplesWithAnchor(
    "HKQuantityTypeIdentifierBodyMass",
    { anchor, limit: 0, unit: "kg" },
  );

  // One weigh-in per day (the API upserts by date): keep the latest per local date.
  const cutoff = new Date(Date.now() - BACKFILL_DAYS * 86_400_000);
  const byDate = new Map<string, { date: Date; kg: number }>();
  for (const s of samples) {
    const at = new Date(s.startDate);
    if (at < cutoff) continue;
    const key = localDateString(at);
    const prev = byDate.get(key);
    if (!prev || at > prev.date) byDate.set(key, { date: at, kg: s.quantity });
  }

  // ponytail: one POST per day (≤90 on first import, then ~1); a bulk endpoint
  // is the upgrade path if that ever feels slow.
  for (const [date, { kg }] of byDate) {
    if (kg < 25 || kg > 400) continue; // mirrors the API's validation range
    await fetchJson("/api/weights", {
      method: "POST",
      body: JSON.stringify({ weight_kg: Math.round(kg * 100) / 100, date }),
    });
  }

  await AsyncStorage.setItem(ANCHOR_KEY, newAnchor);
  await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  return byDate.size > 0;
}
