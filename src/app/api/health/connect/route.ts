import { NextResponse } from "next/server";
import { buildAuthorizeUrl, OAUTH_COOKIE, randomToken } from "@/lib/google-health";

export async function GET() {
  const verifier = randomToken(48);
  const state = randomToken(16);
  const url = await buildAuthorizeUrl(verifier, state);

  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
