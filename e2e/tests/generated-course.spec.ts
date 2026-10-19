import { expect, test } from "@playwright/test";
import { SEEDED_COURSE } from "@senoy/db";
import { confirmedRequest } from "./fixture.ts";

/** Fixture generation writes five Quiz items (`FIXTURE_QUIZ_ITEMS`). */
const QUIZ_ITEMS = 5;

test("An approved Blueprint generates a Course that publishes to Home and completes to 2 / 2", async ({ page }) => {
  // confirmedRequest reseeds: the generated Course must not be the fixture Course.
  await page.goto(await confirmedRequest());
  await page.getByRole("button", { name: "Design my Course Blueprint" }).click();
  await page.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText("Your Course is ready.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Course published")).toBeVisible();

  await page.getByRole("link", { name: "Back to Home" }).click();
  const generated = page.getByRole("link", { name: "Published Fixture Course" });
  await expect(generated).toBeVisible();
  await expect(page.getByRole("link", { name: `Published ${SEEDED_COURSE.title}` })).toBeVisible();
  await expect(page.getByText("Generating your Course")).toHaveCount(0);
  await expect(page.getByText("Drum kit"), "The published Request is listed as its Course.").toHaveCount(0);

  await generated.click();
  await expect(page.getByText("Fixture Course · 0 / 2")).toBeVisible();
  await expect(page.getByText("Fixture prose for Reading: Fixture capability 4.")).toBeVisible();
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText("Fixture Course · 1 / 2")).toBeVisible();

  await page.getByRole("button", { name: "Lessons" }).click();
  await page.getByRole("navigation", { name: "Lessons" }).getByRole("link", { name: "Quiz: Fixture capability 4" }).click();
  for (let n = 1; n <= QUIZ_ITEMS; n += 1) {
    const item = page.getByRole("group", { name: `${n}. Fixture question ${n}?` });
    await item.getByRole("radio", { name: `Right answer ${n}` }).check();
    const check = item.getByRole("button", { name: "Check" });
    if (await check.count()) await check.click();
  }
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Quiz passed.");
  await expect(page.getByText("Fixture Course · 2 / 2")).toBeVisible();
});
