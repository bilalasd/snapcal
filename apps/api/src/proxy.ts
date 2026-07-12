import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public paths that must NOT require a signed-in user.
const isPublic = createRouteMatcher([
  "/api/cron/(.*)", // cron routes authenticate with CRON_SECRET
]);

// The mobile app sends a Clerk session JWT as `Authorization: Bearer`; Clerk's
// middleware reads it automatically. Unauthenticated API calls get 401 JSON
// (the app has no HTML pages to redirect to).
export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

export const config = {
  matcher: ["/(api|trpc)(.*)"],
};
