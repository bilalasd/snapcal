import * as FS from "expo-file-system/legacy";

// Tiny JSON-on-disk helpers for the crash/offline safety nets (draft.ts,
// queue.ts). All errors are swallowed: persistence is best-effort — the app
// must behave identically with a broken disk, just without the safety net.
const dir = FS.documentDirectory ?? FS.cacheDirectory ?? "";

export async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await FS.readAsStringAsync(dir + name)) as T;
  } catch {
    return null;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  try {
    await FS.writeAsStringAsync(dir + name, JSON.stringify(value));
  } catch {}
}

export async function removeFile(name: string): Promise<void> {
  try {
    await FS.deleteAsync(dir + name, { idempotent: true });
  } catch {}
}
