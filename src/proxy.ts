import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public paths that must NOT require a signed-in user.
const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/cron/(.*)", // cron routes authenticate with CRON_SECRET
  "/manifest.webmanifest",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static assets; run on everything else
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
