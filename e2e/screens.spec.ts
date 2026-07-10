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

const flattenTabBar = `nav[aria-label="Main navigation"]{position:static !important}
  nextjs-portal{display:none !important}`;

for (const s of SCREENS) {
  test(`shot ${s.name}`, async ({ page }) => {
    await page.goto(s.path);
    await page.waitForLoadState("networkidle");
    // Let the snap-in animation and recharts settle before capturing.
    await page.waitForTimeout(900);
    // The tab bar is position:fixed, which Playwright renders mid-page in a
    // fullPage capture and overlaps content. Drop it to static so it sits at
    // the natural page bottom — clean content shots, bar still visible.
    await page.addStyleTag({ content: flattenTabBar });
    await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: true });
  });
}

// The AI-readback review screen only exists mid-flow (after an analysis), so it
// never shows up in a plain page.goto. Seed a realistic multi-item draft — with
// a pending question — into the same sessionStorage slot the "log again" flow
// uses, then let the Add page restore it. Keeps the busiest screen reviewable.
test("shot review", async ({ page }) => {
  await page.goto("/add");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    const draft = {
      name: "Cheese and egg toast breakfast",
      eaten_at: new Date().toISOString(),
      source: "photo",
      question: "Was the egg fried or scrambled?",
      choices: ["Fried", "Scrambled", "Poached"],
      items: [
        { name: "White bread toast", portion: "2 slices", calories: 162, protein_g: 5, carbs_g: 30.5, fat_g: 2.2, usda_match: "Bread, white, commercially prepared, toasted" },
        { name: "Melted cheese", portion: "about 1 slice", calories: 90, protein_g: 5, carbs_g: 1, fat_g: 7 },
        { name: "Fried egg", portion: "1 large egg", calories: 98, protein_g: 6.8, carbs_g: 0.4, fat_g: 7.4, usda_match: "Egg, whole, cooked, fried" },
        { name: "Diet lemon-lime soda", portion: "1 can (12 oz)", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      ],
    };
    sessionStorage.setItem("snapcal_draft", JSON.stringify(draft));
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: flattenTabBar });
  await page.screenshot({ path: `${OUT}/review.png`, fullPage: true });
});
