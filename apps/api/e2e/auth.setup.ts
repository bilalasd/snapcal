import { test as setup, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const authFile = "e2e/.clerk/user.json";

// Signs the test user in once and saves the session; the `screens` project
// reuses it via storageState so every shot is authenticated.
//
// Uses a server-minted sign-in ticket rather than password: this dev instance
// has bot/device-trust checks (`needs_client_trust`) that block a headless
// password sign-in. A ticket is trusted server-side and completes directly.
setup("authenticate", async ({ page }) => {
  const backend = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const email = process.env.E2E_CLERK_USER_EMAIL!;
  const { data } = await backend.users.getUserList({ emailAddress: [email] });
  const user = data[0];
  if (!user) throw new Error(`No Clerk user for ${email}`);
  const { token } = await backend.signInTokens.createSignInToken({
    userId: user.id,
    expiresInSeconds: 600,
  });

  await setupClerkTestingToken({ page });
  await page.goto("/sign-in");
  await page.waitForFunction(() => (window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded, null, {
    timeout: 20_000,
  });
  const status = await page.evaluate(async (ticket) => {
    const c = (window as unknown as { Clerk: { client: { signIn: { create: (o: unknown) => Promise<{ status: string; createdSessionId: string }> } }; setActive: (o: unknown) => Promise<void> } }).Clerk;
    const si = await c.client.signIn.create({ strategy: "ticket", ticket });
    if (si.status === "complete") await c.setActive({ session: si.createdSessionId });
    return si.status;
  }, token);
  if (status !== "complete") throw new Error(`Sign-in not complete: ${status}`);

  await page.goto("/");
  // The tab bar only renders inside the authed app layout — proof the session stuck.
  await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible({
    timeout: 15_000,
  });
  await page.context().storageState({ path: authFile });
});
