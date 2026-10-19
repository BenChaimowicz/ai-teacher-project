import { expect, test } from "@playwright/test";
import { confirmedRequest } from "./fixture.ts";

test("Review shows titles and Lesson goals, keeps the Sequence mode pick across a reload, and Approve starts generation", async ({ page }) => {
  await page.goto(await confirmedRequest());
  await page.getByRole("button", { name: "Design my Course Blueprint" }).click();

  await expect(page.getByRole("heading", { name: "Review your Course Blueprint" })).toBeVisible();
  await expect(page.getByText("Lesson 1 · Reading")).toBeVisible();
  await expect(page.getByText("Reading: Fixture capability 4")).toBeVisible();
  await expect(page.getByText("Use Fixture capability 4 toward your goal.")).toBeVisible();
  await expect(page.getByText("Lesson 2 · Quiz")).toBeVisible();
  await expect(page.getByText("Show you can use Fixture capability 4.")).toBeVisible();
  await expect(page.getByText(/Explain Fixture capability/)).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Linear/ })).toBeChecked();

  await page.getByRole("radio", { name: /Free jump/ }).check();
  await expect(page.getByText("you can't switch this Course back to linear order")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Free jump/ })).toBeEnabled();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Review your Course Blueprint" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Free jump/ })).toBeChecked();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Your Course is being generated.")).toBeVisible();
  await expect(page.getByText("Lesson order: free jump.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Your approved Course Blueprint" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
});
