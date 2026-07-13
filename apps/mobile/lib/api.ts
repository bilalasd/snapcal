import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy";
import type { ApiMeal, DraftPhoto } from "@mealio/shared";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// Clerk's getToken lives behind a hook, so a component registers it once
// (see AuthTokenBridge in _layout) and the plain fetch client reads it here.
let getToken: (() => Promise<string | null>) | null = null;
export function setTokenGetter(fn: () => Promise<string | null>) {
  getToken = fn;
}

/** Upload one resized photo (local file uri) to /api/photos as raw bytes. */
export async function uploadPhoto(uri: string): Promise<DraftPhoto> {
  const token = getToken ? await getToken() : null;
  const res = await uploadAsync(`${BASE_URL}/api/photos`, uri, {
    httpMethod: "POST",
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "content-type": "image/jpeg",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
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
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed (${res.status})`,
    );
  }
  return res.json();
}

function tzOffsetMinutes(): number {
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
