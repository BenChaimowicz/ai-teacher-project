import { expect, test, type Page } from "@playwright/test";
import { resetFixture } from "./fixture.ts";

/** The fixture gate's clarification (apps/api/src/lib/validity-fixture.ts). */
const QUESTION = "Do you mean unicorns in myths and stories, or caring for a real animal?";

/** Types what to learn on New course; that one line is the topic and the goal as typed. */
async function compose(page: Page, topic: string) {
  await page.goto("/new-course-request");
  await page.getByLabel("What would you like to learn?").fill(topic);
  await page.getByRole("button", { name: "Continue" }).click();
}

test("What to learn is typed once, with no generic goal question, and the checks that need no Learner start by themselves", async ({ page }) => {
  await resetFixture();
  await compose(page, "Drum kit");
  await expect(page).toHaveURL(/\/course-requests\//);
  // Validity passes and the Starting Level check is prepared, with no button in between.
  await expect(page.getByRole("group", { name: "Question 1 of 8" })).toBeVisible({ timeout: 10_000 });
  const thread = page.getByRole("log");
  await expect(thread.getByText(/^You: ?Drum kit$/)).toBeVisible();
  await expect(thread.getByText("What would you like to get out of it?")).toHaveCount(0);
});

test("A suggestion fills the topic in one tap", async ({ page }) => {
  await resetFixture();
  await page.goto("/new-course-request");
  await page.getByRole("button", { name: "Norse mythology" }).click();
  await expect(page).toHaveURL(/\/course-requests\//);
  await expect(page.getByRole("log").getByText(/^You: ?Norse mythology$/)).toBeVisible();
});

test("A clarification is answered by tapping, and a learnable framing passes", async ({ page }) => {
  await resetFixture();
  await compose(page, "How to feed unicorns");
  const answers = page.getByRole("group", { name: QUESTION });
  await expect(answers).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await answers.getByRole("button", { name: "Unicorns in myths and stories" }).click();
  await expect(page.getByRole("group", { name: "Question 1 of 8" })).toBeVisible({ timeout: 10_000 });
});

test("Confirming the unsupported framing declines the request; Revise request reopens the topic and the original stays", async ({ page }) => {
  await resetFixture();
  await compose(page, "How to feed unicorns");
  await page.getByRole("group", { name: QUESTION }).getByRole("button", { name: "Caring for a real unicorn" }).click({ timeout: 10_000 });
  await expect(page.getByText("I can't make this one.")).toBeVisible();
  await expect(page.getByText(/What I could do instead: Study the premise as mythology/)).toBeVisible();
  const original = page.url();

  await page.getByRole("button", { name: /^Revise request/ }).click();
  await expect(page.getByLabel("What would you like to learn?")).toHaveValue("How to feed unicorns");
  await page.getByRole("link", { name: "View original request" }).click();
  await expect(page).toHaveURL(original);
  await expect(page.getByText("I can't make this one.")).toBeVisible();
});

test("A check that can't finish says so and offers Try again", async ({ page }) => {
  await resetFixture();
  await compose(page, "[unavailable] drums");
  await expect(page.getByRole("alert")).toContainText("could not finish", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^Try again/ })).toBeVisible();
});

test("Without How you like to learn, New course offers to set it up first", async ({ page }) => {
  await resetFixture();
  await page.request.delete("/api/teaching-profile");
  await page.goto("/new-course-request");
  await expect(page.getByRole("button", { name: /^Set it up/ })).toBeVisible();
  await expect(page.getByLabel("What would you like to learn?")).toHaveCount(0);
});

test("A topic chosen elsewhere (?topic=) is saved straight away", async ({ page }) => {
  await resetFixture();
  await page.goto("/new-course-request?topic=Sourdough%20bread");
  await expect(page.getByLabel("What would you like to learn?")).toHaveCount(0);
  await expect(page).toHaveURL(/\/course-requests\//);
  await expect(page.getByRole("log").getByText(/^You: ?Sourdough bread$/)).toBeVisible();
});
