import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = "preview";
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  { name: "today", path: "/" },
  { name: "history", path: "/history" },
  { name: "weight", path: "/weight" },
  { name: "add", path: "/add" },
  { name: "settings", path: "/settings" },
  { name: "onboarding", path: "/onboarding" },
];

for (const s of SCREENS) {
  test(`shot ${s.name}`, async ({ page }) => {
    await page.goto(s.path);
    await page.waitForLoadState("networkidle");
    // Let the snap-in animation and recharts settle before capturing.
    await page.waitForTimeout(900);
    // The tab bar is position:fixed, which Playwright renders mid-page in a
    // fullPage capture and overlaps content. Drop it to static so it sits at
    // the natural page bottom — clean content shots, bar still visible.
    await page.addStyleTag({
      content: `nav[aria-label="Main navigation"]{position:static !important}
        nextjs-portal{display:none !important}`,
    });
    await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: true });
  });
}
