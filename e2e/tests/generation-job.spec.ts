import { expect, test } from "@playwright/test";
import { confirmedRequest } from "./fixture.ts";

test("Waiting shows the current Lesson; Cancel keeps finished Lessons and never resumes by itself; Resume publishes", async ({ page }) => {
  await page.goto(await confirmedRequest());
  await page.getByRole("button", { name: "Design my Course Blueprint" }).click();
  await page.getByRole("button", { name: "Approve" }).click();

  // The worker writes the Reading first, then the Quiz.
  await expect(page.getByText(/^Writing Lesson 2 of 2: “Quiz: /)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Fixture prose|Fixture question/)).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel generation" }).click();
  await expect(page.getByText("Generation is cancelled. The 1 of 2 Lessons already written are kept")).toBeVisible();

  // Longer than the Quiz in flight takes: a cancelled job neither finishes nor picks itself up again.
  await page.waitForTimeout(5_000);
  await page.reload();
  await expect(page.getByText("Course generation cancelled")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Your Course is ready.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Open in Study" }).click();
  await expect(page.getByText("Fixture Course · 0 / 2")).toBeVisible();
});
