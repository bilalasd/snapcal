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

// A realistic multi-item draft with a pending question, seeded into the same
// sessionStorage slot the "log again" flow uses so the Add page restores it.
const REVIEW_DRAFT = {
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

async function shootFull(page: import("@playwright/test").Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: flattenTabBar });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

// The AI-readback review screen only exists mid-flow (after an analysis), so it
// never shows up in a plain page.goto. Keeps the busiest screen reviewable.
test("shot review", async ({ page }) => {
  await page.goto("/add");
  await page.waitForLoadState("networkidle");
  await page.evaluate((d) => {
    sessionStorage.setItem("snapcal_draft", JSON.stringify(d));
  }, REVIEW_DRAFT);
  await page.reload();
  await shootFull(page, "review");
});

// --- Drawer / sheet states. Overlays sit at the viewport bottom, so capture the
// viewport (not fullPage) to frame the sheet. ---
test("shot meal-drawer", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(700);
  await page.getByText("Salmon & greens").first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/meal-drawer.png` });
});

test("shot food-search", async ({ page }) => {
  await page.goto("/add");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add from food database" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/food-search.png` });
});

test("shot log-weight", async ({ page }) => {
  await page.goto("/weight");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Log weight" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/log-weight.png` });
});

// Full-screen analyzing overlay — appears the instant Analyze is tapped, before
// the API responds, so it renders even without an API key in this env.
test("shot analyzing", async ({ page }) => {
  await page.goto("/add");
  await page.waitForLoadState("networkidle");
  // The note is collapsed by default; reveal it, then a note enables Analyze.
  await page.getByRole("button", { name: "Add a note" }).click();
  await page
    .getByPlaceholder(/Optional details/i)
    .fill("grilled chicken and rice");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByText("Reading your plate…").waitFor();
  await page.screenshot({ path: `${OUT}/analyzing.png` });
});

// Empty day — a past date with no logged meals.
test("shot today-empty", async ({ page }) => {
  await page.goto("/?date=2020-01-01");
  await shootFull(page, "today-empty");
});

// Force dark theme on first paint via an init script (runs before the app's
// inline theme script), so no reload is needed. Reloads were flaky under
// parallel dev-server load. Call BEFORE goto.
async function forceDark(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("snapcal-theme", "dark");
    } catch {}
  });
}

// Like shootFull but does not wait on networkidle (for the dark reload path).
async function shootSoft(page: import("@playwright/test").Page, name: string) {
  await page.waitForTimeout(700);
  await page.addStyleTag({ content: flattenTabBar });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

// Onboarding is a 6-step flow; a plain goto only shows step 1. The seeded user
// is already onboarded so most fields prefill — walk through and shoot each step.
// `suffix` is "" for light and "-dark" for the dark pass.
async function walkOnboarding(
  page: import("@playwright/test").Page,
  suffix: string,
) {
  const cont = () => page.getByRole("button", { name: "Continue" });
  const shot = (n: string) =>
    page.screenshot({
      path: `${OUT}/onboarding-${n}${suffix}.png`,
      fullPage: true,
    });

  await cont().click(); // units -> you
  await page.waitForTimeout(400);
  await shot("you");

  await cont().click(); // you -> body
  await page.waitForTimeout(400);
  await page.getByLabel(/Current weight/i).fill("80");
  await shot("body");

  await cont().click(); // body -> activity
  await page.waitForTimeout(400);
  await shot("activity");

  await cont().click(); // activity -> goal
  await page.waitForTimeout(400);
  await page.getByText("Lose", { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText("Recommended").first().click();
  await shot("goal");

  await cont().click(); // goal -> result
  await page.waitForTimeout(700);
  await shot("result");
}

test("shot onboarding-steps", async ({ page }) => {
  await page.goto("/onboarding");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(700);
  await walkOnboarding(page, "");
});

test("shot onboarding-steps-dark", async ({ page }) => {
  await forceDark(page);
  await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await walkOnboarding(page, "-dark");
});

// Dark-mode variants of the token-heavy screens.
const DARK_SCREENS = [
  { name: "today-dark", path: "/" },
  { name: "history-dark", path: "/history" },
  { name: "weight-dark", path: "/weight" },
  { name: "settings-dark", path: "/settings" },
  { name: "add-dark", path: "/add" },
];
for (const s of DARK_SCREENS) {
  test(`shot ${s.name}`, async ({ page }) => {
    await forceDark(page);
    await page.goto(s.path, { waitUntil: "domcontentloaded" });
    await shootSoft(page, s.name);
  });
}

// Dark review — draft + dark theme, both seeded before first paint.
test("shot review-dark", async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      localStorage.setItem("snapcal-theme", "dark");
      sessionStorage.setItem("snapcal_draft", JSON.stringify(d));
    } catch {}
  }, REVIEW_DRAFT);
  await page.goto("/add", { waitUntil: "domcontentloaded" });
  await shootSoft(page, "review-dark");
});

// Onboarding step 1 (dark) and the empty day (dark).
test("shot onboarding-dark", async ({ page }) => {
  await forceDark(page);
  await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
  await shootSoft(page, "onboarding-dark");
});

test("shot today-empty-dark", async ({ page }) => {
  await forceDark(page);
  await page.goto("/?date=2020-01-01", { waitUntil: "domcontentloaded" });
  await shootSoft(page, "today-empty-dark");
});

// (Auth dark variants live in public.spec.ts — this project is authenticated,
// so /sign-in would redirect to the app.)

// Drawers + analyzing overlay in dark.
test("shot meal-drawer-dark", async ({ page }) => {
  await forceDark(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByText("Salmon & greens").first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/meal-drawer-dark.png` });
});

test("shot food-search-dark", async ({ page }) => {
  await forceDark(page);
  await page.goto("/add", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add from food database" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/food-search-dark.png` });
});

test("shot log-weight-dark", async ({ page }) => {
  await forceDark(page);
  await page.goto("/weight", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Log weight" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/log-weight-dark.png` });
});

test("shot analyzing-dark", async ({ page }) => {
  await forceDark(page);
  await page.goto("/add", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add a note" }).click();
  await page.getByPlaceholder(/Optional details/i).fill("grilled chicken");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByText("Reading your plate…").waitFor();
  await page.screenshot({ path: `${OUT}/analyzing-dark.png` });
});
