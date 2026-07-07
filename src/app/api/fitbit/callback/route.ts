import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, OAUTH_COOKIE, syncWeights } from "@/lib/fitbit";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookie = request.cookies.get(OAUTH_COOKIE)?.value;

  const settingsUrl = new URL("/settings", request.url);

  if (!code || !state || !cookie) {
    settingsUrl.searchParams.set("fitbit_error", "missing_state");
    return NextResponse.redirect(settingsUrl);
  }

  const [expectedState, verifier] = cookie.split(".");
  if (state !== expectedState || !verifier) {
    settingsUrl.searchParams.set("fitbit_error", "bad_state");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    await exchangeCode(code, verifier);
    // Initial backfill: one year of weight logs
    await syncWeights(365);
  } catch (err) {
    console.error("Fitbit connect failed", err);
    settingsUrl.searchParams.set("fitbit_error", "exchange_failed");
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.set(OAUTH_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  }

  settingsUrl.searchParams.set("fitbit_connected", "1");
  const response = NextResponse.redirect(settingsUrl);
  response.cookies.set(OAUTH_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
