import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { exchangeCode, OAUTH_COOKIE, syncWeights } from "@/lib/google-health";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookie = request.cookies.get(OAUTH_COOKIE)?.value;

  const settingsUrl = new URL("/settings", request.url);

  if (!code || !state || !cookie) {
    settingsUrl.searchParams.set("health_error", "missing_state");
    return NextResponse.redirect(settingsUrl);
  }

  const [expectedState, verifier] = cookie.split(".");
  if (state !== expectedState || !verifier) {
    settingsUrl.searchParams.set("health_error", "bad_state");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    await exchangeCode(userId, code, verifier);
    // Initial backfill: one year of weight logs
    await syncWeights(userId, 365);
  } catch (err) {
    console.error("Google Health connect failed", err);
    settingsUrl.searchParams.set("health_error", "exchange_failed");
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.set(OAUTH_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  }

  settingsUrl.searchParams.set("health_connected", "1");
  const response = NextResponse.redirect(settingsUrl);
  response.cookies.set(OAUTH_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
