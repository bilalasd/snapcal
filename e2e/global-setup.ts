import { clerkSetup } from "@clerk/testing/playwright";

// Fetches a Clerk Testing Token so the test user can sign in without bot
// protection getting in the way. Reads CLERK keys from the env loaded in
// playwright.config.ts.
export default async function globalSetup() {
  await clerkSetup();
}
