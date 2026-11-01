import { expect, test, type Browser } from "@playwright/test";
import { SEEDED_COURSE, SEEDED_COURSE_ID } from "@senoy/db";
import { authHeaders, testAccounts } from "../accounts.ts";
import { resetFixture } from "./fixture.ts";

/**
 * A page signed in as test account `b`, who owns nothing.
 * @param browser - Playwright browser
 */
async function pageAsB(browser: Browser) {
  const context = await browser.newContext({ storageState: testAccounts().b.storageState });
  return context.newPage();
}

test("a signed-out visitor is sent to sign-in", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  const response = await page.request.get("/api/library");
  expect(response.status()).toBe(401);
});

test("another Learner never sees account a's Course", async ({ browser }) => {
  await resetFixture();
  const page = await pageAsB(browser);
  await page.goto("/");
  await expect(page.getByRole("link", { name: /How you like to learn/ }).first()).toBeVisible();
  await expect(page.getByText(SEEDED_COURSE.title)).toHaveCount(0);

  const headers = authHeaders("b");
  expect((await page.request.get(`/api/courses/${SEEDED_COURSE_ID}`, { headers })).status()).toBe(404);
  const library = await page.request.get("/api/library", { headers });
  expect(library.status()).toBe(200);
  expect(JSON.stringify(await library.json())).not.toContain(SEEDED_COURSE_ID);
});

test("account a sees its own Course and its display name", async ({ page }) => {
  await resetFixture();
  await page.goto("/");
  await expect(page.getByText(SEEDED_COURSE.title).first()).toBeVisible();
  // The name lives in the account menu behind the initials at the top right, and on the profile.
  await page.getByRole("button", { name: /^Account menu/ }).click();
  await expect(page.getByText("Curious_Owl").first()).toBeVisible();
  await page.getByRole("menuitem", { name: "Profile & settings" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: "Curious_Owl" })).toBeVisible();
  await expect(page.getByText("Courses finished")).toBeVisible();
});

test("signing in with a password opens the Workspace", async ({ browser }) => {
  const { email, password } = testAccounts().b;
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.getByRole("link", { name: /How you like to learn/ }).first()).toBeVisible();
});
