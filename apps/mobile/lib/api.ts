import type { ApiMeal } from "@mealio/shared";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// Clerk's getToken lives behind a hook, so a component registers it once
// (see AuthTokenBridge in _layout) and the plain fetch client reads it here.
let getToken: (() => Promise<string | null>) | null = null;
export function setTokenGetter(fn: () => Promise<string | null>) {
  getToken = fn;
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
