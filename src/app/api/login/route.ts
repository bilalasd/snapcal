import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  const { passcode } = await request.json().catch(() => ({}));
  const expected = process.env.APP_PASSCODE;

  if (!expected) {
    return NextResponse.json(
      { error: "APP_PASSCODE is not configured" },
      { status: 500 },
    );
  }

  if (typeof passcode !== "string" || passcode !== expected) {
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }

  const { token, expiresAt } = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return response;
}
