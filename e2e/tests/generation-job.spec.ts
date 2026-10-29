import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { confirmedRequest } from "./fixture.ts";

/** Waits for the plan the worker designs by itself, then makes the Course. */
async function makeCourse(page: Page) {
  await page.getByRole("button", { name: /^Make my course/ }).click({ timeout: 15_000 });
}

test("Waiting shows the current lesson and ticks finished ones; Stop keeps them and never resumes by itself; Resume publishes", async ({ page }) => {
  await page.goto(await confirmedRequest());
  await makeCourse(page);

  // The worker writes both Readings first, then the Quiz.
  await expect(page.getByText(/^Writing lesson 3 of 3: “Quiz: /)).toBeVisible({ timeout: 15_000 });
  const lessons = page.getByRole("list", { name: "Lessons" });
  await expect(lessons.getByRole("listitem").filter({ hasText: "Reading: Fixture capability 4" })).toContainText("written");
  await expect(lessons.getByRole("listitem").filter({ hasText: "Quiz:" })).toContainText("writing now");
  await expect(page.getByText(/Fixture prose|Fixture question/)).toHaveCount(0);
  await page.getByRole("button", { name: /^Stop making this course/ }).click();
  await expect(page.getByText("The 2 of 3 lessons already written are kept")).toBeVisible();

  // Longer than the Quiz in flight takes: a stopped job neither finishes nor picks itself up again.
  await page.waitForTimeout(5_000);
  await page.reload();
  await expect(page.getByText("It won't restart by itself.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Resume/ })).toBeVisible();

  await page.getByRole("button", { name: /^Resume/ }).click();
  await expect(page.getByText("Your course is ready.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Start lesson 1/ }).click();
  await expect(page.getByText("Fixture Course · 0 / 3")).toBeVisible();
});

test("A lesson that fails its checks says why; Retry writes it again and the Course publishes", async ({ page }) => {
  // Two failed runs and a full one, at FIXTURE_LESSON_DELAY_MS per Lesson.
  test.setTimeout(60_000);
  // The fixture fails each Reading's first attempt for this goal (FAIL_ONCE_MARKER); the uuid keeps the goal unique.
  await page.goto(await confirmedRequest(`Play Iris by the Goo Goo Dolls [fail-once] ${randomUUID()}`));
  await makeCourse(page);

  // The first Reading fails before anything is written, so there is nothing to promise back (SEN-95).
  const reason = page.getByRole("alert");
  await expect(reason).toHaveText(
    /^We couldn't write the Lesson “.+” so that it passed our quality checks\. Retry tries that Lesson again\.$/,
    { timeout: 15_000 });
  await expect(page.getByRole("list", { name: "Lessons" }).getByText("stopped here")).toBeVisible();
  await page.getByRole("button", { name: /^Retry/ }).click();
  await expect(page.getByText(/^Writing lesson \d of 3/)).toBeVisible();

  // The second Reading fails once too; the first stays written.
  await expect(reason).toHaveText(
    /^We couldn't write the Lesson “.+” so that it passed our quality checks\. Retry tries again from there, keeping the Lesson already written\.$/,
    { timeout: 15_000 });
  await page.getByRole("button", { name: /^Retry/ }).click();
  await expect(page.getByText("Your course is ready.")).toBeVisible({ timeout: 20_000 });
});
