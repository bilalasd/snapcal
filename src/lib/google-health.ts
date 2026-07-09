import { eq, sql } from "drizzle-orm";
import { db, healthTokens, weights } from "@/db";

// Google Health API (successor to the Fitbit Web API, sunset Sept 2026).
// OAuth is standard Google OAuth 2.0 + PKCE; weight comes back in grams.
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://health.googleapis.com";
const SCOPE =
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly";

export const OAUTH_COOKIE = "snapcal_health_oauth";

function clientId(): string {
  const id = process.env.GOOGLE_HEALTH_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_HEALTH_CLIENT_ID is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_HEALTH_CLIENT_SECRET is not set");
  return secret;
}

export function redirectUri(): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/health/callback`;
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
    scope: SCOPE,
    redirect_uri: redirectUri(),
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    state,
    // Required for Google to issue a refresh token:
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export class TokenError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Google token request failed (${status})`);
  }
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new TokenError(res.status, await res.text());
  }
  return res.json();
}

export async function exchangeCode(
  userId: string,
  code: string,
  verifier: string,
) {
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri(),
      client_id: clientId(),
      client_secret: clientSecret(),
    }),
  );
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token");
  }
  await saveTokens(userId, tokens);
}

async function saveTokens(userId: string, tokens: TokenResponse) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const [existing] = await db
    .select()
    .from(healthTokens)
    .where(eq(healthTokens.userId, userId));
  await db
    .insert(healthTokens)
    .values({
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? existing?.refreshToken ?? "",
      expiresAt,
      needsReconnect: false,
    })
    .onConflictDoUpdate({
      target: healthTokens.userId,
      set: {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
        expiresAt,
        needsReconnect: false,
      },
    });
}

/**
 * Returns a valid access token, refreshing if needed.
 * Null if not connected or the refresh token has expired — Google OAuth
 * apps in "Testing" mode expire refresh tokens after 7 days, so this is
 * an expected periodic state; the UI prompts a one-tap reconnect.
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(healthTokens)
    .where(eq(healthTokens.userId, userId));
  if (!row || row.needsReconnect) return null;

  if (row.expiresAt.getTime() > Date.now() + 60_000) {
    return row.accessToken;
  }

  try {
    const tokens = await tokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: row.refreshToken,
        client_id: clientId(),
        client_secret: clientSecret(),
      }),
    );
    await saveTokens(userId, tokens);
    return tokens.access_token;
  } catch (err) {
    if (err instanceof TokenError && err.status === 400) {
      // invalid_grant → refresh token expired/revoked; prompt reconnect
      await db
        .update(healthTokens)
        .set({ needsReconnect: true })
        .where(eq(healthTokens.userId, userId));
      return null;
    }
    throw err;
  }
}

interface DataPoint {
  weight?: { weightGrams?: number | string };
  sampleTime?: { physicalTime?: string; utcOffset?: string };
}

/**
 * Fetch weight data points since `sinceDays` ago and upsert into `weights`.
 * One entry per local calendar day (the last reading of a day wins).
 */
export async function syncWeights(
  userId: string,
  sinceDays: number,
): Promise<number> {
  const accessToken = await getAccessToken(userId);
  if (!accessToken) throw new Error("Google Health not connected");

  const from = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  let pageToken: string | undefined;
  let count = 0;

  do {
    const params = new URLSearchParams({
      filter: `sampleTime.physicalTime >= "${from.toISOString()}"`,
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `${API_BASE}/v4/users/me/dataTypes/weight/dataPoints?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      // Log the body — the API is new and error details matter for debugging
      const text = await res.text();
      console.error("Google Health weight fetch failed", res.status, text);
      throw new Error(`Google Health weight fetch failed (${res.status})`);
    }
    const data = (await res.json()) as {
      dataPoints?: DataPoint[];
      nextPageToken?: string;
    };

    for (const point of data.dataPoints ?? []) {
      const grams = Number(point.weight?.weightGrams);
      const time = point.sampleTime?.physicalTime;
      if (!grams || !time) continue;
      // Local calendar day of the reading (physicalTime carries the offset)
      const day = time.slice(0, 10);
      const kg = (grams / 1000).toFixed(2);
      await db
        .insert(weights)
        .values({ userId, date: day, weightKg: kg })
        .onConflictDoUpdate({
          target: [weights.userId, weights.date],
          set: { weightKg: kg },
        });
      count++;
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  await db
    .update(healthTokens)
    .set({ lastSyncedAt: sql`now()` })
    .where(eq(healthTokens.userId, userId));

  return count;
}

export async function getHealthStatus(userId: string) {
  const [row] = await db
    .select()
    .from(healthTokens)
    .where(eq(healthTokens.userId, userId));
  return {
    connected: Boolean(row) && !row?.needsReconnect,
    needs_reconnect: Boolean(row?.needsReconnect),
    last_synced_at: row?.lastSyncedAt?.toISOString() ?? null,
  };
}

/** How many days to backfill: full year on first sync, else since last sync. */
export async function backfillDays(userId: string): Promise<number> {
  const [row] = await db
    .select()
    .from(healthTokens)
    .where(eq(healthTokens.userId, userId));
  if (!row?.lastSyncedAt) return 365;
  const daysSince = Math.ceil(
    (Date.now() - row.lastSyncedAt.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.max(daysSince + 1, 2);
}
