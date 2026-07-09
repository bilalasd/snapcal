import { defineConfig } from "@playwright/test";

// Load Clerk keys + DATABASE_URL + E2E creds for clerkSetup and the dev server.
process.loadEnvFile?.(".env.local");

// Chromium mobile viewport. isMobile/hasTouch are Chromium-only, which also
// keeps the browser on Chromium (headless Chrome is already installed).
const mobile = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    // Use the full Chromium build (chromium-1228) rather than the separate
    // chrome-headless-shell binary, which avoids an extra browser download.
    channel: "chromium",
    ...mobile,
  },
  projects: [
    { name: "auth", testMatch: /auth\.setup\.ts/ },
    {
      name: "screens",
      testMatch: /screens\.spec\.ts/,
      dependencies: ["auth"],
      use: { storageState: "e2e/.clerk/user.json" },
    },
    // Signed-out shots (sign-in / sign-up) — no stored session.
    { name: "public", testMatch: /public\.spec\.ts/ },
  ],
  // Dedicated port so we never latch onto another project's dev server on :3000.
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
