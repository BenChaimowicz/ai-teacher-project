import { expect, test } from "@playwright/test";
import { SEEDED_COURSE } from "@senoy/db";
import { resetFixture } from "./fixture.ts";

test("removing a course takes it off Home and the sidebar for good", async ({ page }) => {
  await resetFixture();
  await page.goto("/");
  const main = page.getByRole("main");
  const sidebar = page.getByTestId("sidebar-inner");
  await expect(sidebar.getByText(SEEDED_COURSE.title)).toBeVisible();

  const card = main.locator(".k-removable").filter({ hasText: SEEDED_COURSE.title }).first();
  await card.hover();
  await card.getByRole("button", { name: `Remove ${SEEDED_COURSE.title}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();

  await expect(sidebar.getByText(SEEDED_COURSE.title)).toHaveCount(0);
  await expect(main.getByText(SEEDED_COURSE.title)).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("What would you like to learn?").first()).toBeVisible();
  await expect(page.getByTestId("sidebar-inner").getByText(SEEDED_COURSE.title)).toHaveCount(0);
});
