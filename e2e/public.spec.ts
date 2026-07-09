import { test } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { mkdirSync } from "node:fs";

const OUT = "preview";
mkdirSync(OUT, { recursive: true });

// Signed-out auth screens (the Clerk widget renders here).
const PAGES = [
  { name: "sign-in", path: "/sign-in" },
  { name: "sign-up", path: "/sign-up" },
];

for (const p of PAGES) {
  test(`shot ${p.name}`, async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto(p.path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(900);
    await page.addStyleTag({ content: `nextjs-portal{display:none !important}` });
    await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: true });
  });
}
