import { expect, test } from "@playwright/test";
import { addWaitingRequests, resetFixture } from "./fixture.ts";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`the sidebar never scrolls with a full course list at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await resetFixture();
    await addWaitingRequests(6);
    await page.setViewportSize(viewport);
    await page.goto("/");

    const sidebar = page.getByTestId("sidebar-inner");
    await expect(sidebar.getByText(/see all on Home/)).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "How you like to learn" })).toBeInViewport();
    const { scrollHeight, clientHeight } = await sidebar.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
  });
}

test("on a narrow screen the sidebar is a drawer that Esc closes", async ({ page }) => {
  await resetFixture();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const toggle = page.getByRole("button", { name: "Show sidebar" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByRole("link", { name: "How you like to learn" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Show sidebar" })).toHaveAttribute("aria-expanded", "false");
});
