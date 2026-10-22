import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { confirmedRequest } from "./fixture.ts";

test("Waiting shows the current Lesson; Cancel keeps finished Lessons and never resumes by itself; Resume publishes", async ({ page }) => {
  await page.goto(await confirmedRequest());
  await page.getByRole("button", { name: "Design my Course Blueprint" }).click();
  await page.getByRole("button", { name: "Approve" }).click();

  // The worker writes both Readings first, then the Quiz.
  await expect(page.getByText(/^Writing Lesson 3 of 3: “Quiz: /)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Fixture prose|Fixture question/)).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel generation" }).click();
  await expect(page.getByText("Generation is cancelled. The 2 of 3 Lessons already written are kept")).toBeVisible();

  // Longer than the Quiz in flight takes: a cancelled job neither finishes nor picks itself up again.
  await page.waitForTimeout(5_000);
  await page.reload();
  await expect(page.getByText("Course generation cancelled")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Your Course is ready.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Open in Study" }).click();
  await expect(page.getByText("Fixture Course · 0 / 3")).toBeVisible();
});

test("A Lesson that fails its checks says why; Retry writes it again and the Course publishes", async ({ page }) => {
  // The fixture fails each Reading's first attempt for this goal (FAIL_ONCE_MARKER); the uuid keeps the goal unique.
  await page.goto(await confirmedRequest(`Play Iris by the Goo Goo Dolls [fail-once] ${randomUUID()}`));
  await page.getByRole("button", { name: "Design my Course Blueprint" }).click();
  await page.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    /^We couldn't write the Lesson “.+” so that it passed our quality checks\. Retry tries again from there, keeping the Lessons already written\.$/,
    { timeout: 15_000 });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText(/^Writing Lesson \d of 3/)).toBeVisible();

  // The second Reading fails once too; the first stays written.
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Your Course is ready.")).toBeVisible({ timeout: 20_000 });
});
