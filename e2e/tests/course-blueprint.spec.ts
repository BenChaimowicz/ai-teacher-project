import { expect, test } from "@playwright/test";
import { confirmedRequest } from "./fixture.ts";

test("The plan designs itself; review shows titles and goals, keeps Jump around across a reload, and Make my course starts writing", async ({ page }) => {
  await page.goto(await confirmedRequest());

  // The worker designs the plan as a job, with no click; the page checks back until it is ready.
  await expect(page.getByText("Here's a plan. Your call.")).toBeVisible({ timeout: 15_000 });
  const lessons = page.getByRole("list", { name: "Lessons" });
  await expect(lessons.getByText("Reading: Fixture capability 4")).toBeVisible();
  await expect(lessons.getByText("Use Fixture capability 4 toward your goal.")).toBeVisible();
  await expect(lessons.getByText("Reading: Fixture capability 5")).toBeVisible();
  await expect(lessons.getByText("Show you can use Fixture capability 4 and Fixture capability 5.")).toBeVisible();
  await expect(lessons.getByText("Quiz", { exact: true })).toHaveCount(1);
  await expect(page.getByText(/Explain Fixture capability/)).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Step by step" })).toBeChecked();

  await page.getByRole("radio", { name: "Jump around" }).check();
  await expect(page.getByText("you can't switch back to step by step")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Here's a plan. Your call.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Jump around" })).toBeChecked();

  await page.getByRole("button", { name: /^Make my course/ }).click();
  await expect(page.getByText("On it. You can leave; I'll keep going.")).toBeVisible();
  await expect(page.getByText(/3 lessons · jump around/)).toBeVisible();
  await expect(page.getByText("You can leave: I'll keep writing")).toBeVisible();

  await page.reload();
  await expect(page.getByText("On it. You can leave; I'll keep going.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Make my course/ })).toHaveCount(0);
});

test("Unticking a lesson marks it not relevant, and the plan is redone without it", async ({ page }) => {
  await page.goto(await confirmedRequest());
  await expect(page.getByText("Here's a plan. Your call.")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("checkbox", { name: /^Keep lesson 1: Reading: Fixture capability 4/ }).uncheck();
  await expect(page.getByRole("button", { name: /^Make my course/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Redo the plan without these/ }).click();
  await page.getByRole("button", { name: /^I know these already/ }).click();

  const lessons = page.getByRole("list", { name: "Lessons" });
  await expect(lessons.getByText("Reading: Fixture capability 6")).toBeVisible({ timeout: 15_000 });
  await expect(lessons.getByText("Reading: Fixture capability 4")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /^Keep lesson 1: Reading: Fixture capability 5/ })).toBeChecked();
  await expect(page.getByRole("button", { name: /^Make my course/ })).toBeVisible();
});
