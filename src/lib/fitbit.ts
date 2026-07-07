import { eq, sql } from "drizzle-orm";
import { db, fitbitTokens, weights } from "@/db";

const AUTHORIZE_URL = "https://www.fitbit.com/oauth2/authorize";
const TOKEN_URL = "https://api.fitbit.com/oauth2/token";
const API_BASE = "https://api.fitbit.com";

export const OAUTH_COOKIE = "snapcal_fitbit_oauth";

function clientId(): string {
  const id = process.env.FITBIT_CLIENT_ID;
  if (!id) throw new Error("FITBIT_CLIENT_ID is not set");
  return id;
}

function basicAuth(): string {
  const secret = process.env.FITBIT_CLIENT_SECRET;
  if (!secret) throw new Error("FITBIT_CLIENT_SECRET is not set");
  return Buffer.from(`${clientId()}:${secret}`).toString("base64");
}

export function redirectUri(): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/fitbit/callback`;
}

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Buffer.from(arr).toString("base64url");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

export async function buildAuthorizeUrl(
  verifier: string,
  state: string,
): Promise<string> {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    scope: "weight",
    redirect_uri: redirectUri(),
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fitbit token request failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function exchangeCode(code: string, verifier: string) {
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri(),
      client_id: clientId(),
    }),
  );
  await saveTokens(tokens);
}

async function saveTokens(tokens: TokenResponse) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await db
    .insert(fitbitTokens)
    .values({
      id: 1,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: fitbitTokens.id,
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      },
    });
}

/** Returns a valid access token, refreshing if needed. Null if not connected. */
export async function getAccessToken(): Promise<string | null> {
  const [row] = await db.select().from(fitbitTokens);
  if (!row) return null;

  if (row.expiresAt.getTime() > Date.now() + 60_000) {
    return row.accessToken;
  }

  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
      client_id: clientId(),
    }),
  );
  await saveTokens(tokens);
  return tokens.access_token;
}

interface FitbitWeightLog {
  date: string; // YYYY-MM-DD
  weight: number; // kg (Fitbit default units without Accept-Language header)
}

/** Fetch weight logs for a ≤31-day window (Fitbit's per-request limit). */
async function fetchWeightWindow(
  accessToken: string,
  start: string,
  end: string,
): Promise<FitbitWeightLog[]> {
  const res = await fetch(
    `${API_BASE}/1/user/-/body/log/weight/date/${start}/${end}.json`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Fitbit weight fetch failed (${res.status})`);
  }
  const data = (await res.json()) as {
    weight: Array<{ date: string; weight: number }>;
  };
  return data.weight.map((w) => ({ date: w.date, weight: w.weight }));
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Sync weight logs from `since` (exclusive of already-cached days is fine —
 * upsert makes it idempotent) to today, in ≤31-day windows.
 */
export async function syncWeights(sinceDays: number): Promise<number> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Fitbit not connected");

  const today = new Date();
  let cursor = new Date(today.getTime() - sinceDays * 24 * 60 * 60 * 1000);
  let count = 0;

  while (cursor <= today) {
    const windowEnd = new Date(
      Math.min(
        cursor.getTime() + 30 * 24 * 60 * 60 * 1000,
        today.getTime(),
      ),
    );
    const logs = await fetchWeightWindow(
      accessToken,
      dateStr(cursor),
      dateStr(windowEnd),
    );
    for (const log of logs) {
      await db
        .insert(weights)
        .values({ date: log.date, weightKg: String(log.weight) })
        .onConflictDoUpdate({
          target: weights.date,
          set: { weightKg: String(log.weight) },
        });
      count++;
    }
    cursor = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
  }

  await db
    .update(fitbitTokens)
    .set({ lastSyncedAt: sql`now()` })
    .where(eq(fitbitTokens.id, 1));

  return count;
}

export async function getFitbitStatus() {
  const [row] = await db.select().from(fitbitTokens);
  return {
    connected: Boolean(row),
    last_synced_at: row?.lastSyncedAt?.toISOString() ?? null,
  };
}

/** How many days to backfill: full year on first sync, else since last sync. */
export async function backfillDays(): Promise<number> {
  const [row] = await db.select().from(fitbitTokens);
  if (!row?.lastSyncedAt) return 365;
  const daysSince = Math.ceil(
    (Date.now() - row.lastSyncedAt.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.max(daysSince + 1, 2);
}
