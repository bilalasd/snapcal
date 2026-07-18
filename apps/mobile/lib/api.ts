import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy";
import type { ApiMeal, DraftPhoto } from "@loggi/shared";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const TIMEOUT_MS = 15_000;

// Clerk's getToken lives behind a hook, so a component registers it once
// (see AuthTokenBridge in _layout) and the plain fetch client reads it here.
let getToken: (() => Promise<string | null>) | null = null;
export function setTokenGetter(fn: () => Promise<string | null>) {
  getToken = fn;
}

/** The request never reached the server (offline, DNS, timeout) — safe to
 *  retry or queue. Server-returned errors stay plain Errors. */
export class NetworkError extends Error {
  constructor() {
    super("No connection — check your internet and try again.");
    this.name = "NetworkError";
  }
}
export const isNetworkError = (e: unknown): e is NetworkError =>
  e instanceof NetworkError;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    // fetch only rejects for transport-level failures (or our abort) —
    // anything the server actually answered resolves, even 5xx.
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
}

/** Upload one resized photo (local file uri) to /api/photos as raw bytes. */
export async function uploadPhoto(uri: string): Promise<DraftPhoto> {
  const token = getToken ? await getToken() : null;
  let res: Awaited<ReturnType<typeof uploadAsync>>;
  try {
    res = await uploadAsync(`${BASE_URL}/api/photos`, uri, {
      httpMethod: "POST",
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: {
        "content-type": "image/jpeg",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new NetworkError();
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload ${res.status}: ${(res.body || "").slice(0, 200)}`);
  }
  return JSON.parse(res.body) as DraftPhoto;
}

export async function fetchJson<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getToken ? await getToken() : null;
  const doFetch = () =>
    fetchWithTimeout(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });

  let res: Response;
  try {
    res = await doFetch();
  } catch (err) {
    // Reads are idempotent — one immediate retry papers over blips.
    // Writes are the queue's job (lib/queue.ts), never blind-retried here.
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") throw err;
    res = await doFetch();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed (${res.status})`,
    );
  }
  return res.json();
}

export function tzOffsetMinutes(): number {
  return new Date().getTimezoneOffset();
}

export function fetchMealsForDate(date: string): Promise<ApiMeal[]> {
  return fetchJson(`/api/meals?date=${date}&tz_offset=${tzOffsetMinutes()}`);
}

export function fetchMealsRange(from: Date, to: Date): Promise<ApiMeal[]> {
  return fetchJson(
    `/api/meals?from=${from.toISOString()}&to=${to.toISOString()}`,
  );
}
