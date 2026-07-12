import type { CapacitorConfig } from "@capacitor/cli";

// EXPERIMENT MODE — the native WebView loads the *running* Mealio app rather
// than a bundled static build. Next.js App Router (server components, /api
// routes, Clerk middleware) can't be `next export`ed to static files, so for
// now we point Capacitor at the live app.
//   - iOS simulator reaches the Mac's own localhost, so http://localhost:3000
//     works while `npm run dev` is running.
//   - Physical device: swap to your Mac's LAN IP, e.g. http://192.168.1.x:3000
//     (both on the same Wi-Fi), or your deployed https URL.
// This is a wrapper-around-the-website setup — fine for trying it out, NOT
// App Store-ready (Apple guideline 4.2 rejects thin web wrappers). Shipping
// means splitting a static client frontend from the API.
const config: CapacitorConfig = {
  appId: "com.mealio.app",
  appName: "Mealio",
  webDir: "capacitor-shell",
  server: {
    url: "http://localhost:3000",
    cleartext: true, // allow plain http for local dev
    // Keep Clerk's auth flow inside the WebView instead of bouncing to
    // external Safari. (OAuth providers like Google still block embedded
    // WebViews, so use the Email sign-in path.)
    allowNavigation: ["*.accounts.dev", "*.clerk.accounts.dev", "accounts.dev"],
  },
};

export default config;
