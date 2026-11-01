import { expect, test, type Page } from "@playwright/test";
import { resetFixture } from "./fixture.ts";

/** The fixture gate's clarification (apps/api/src/lib/validity-fixture.ts). */
const QUESTION = "Do you mean unicorns in myths and stories, or caring for a real animal?";

/** Once the goal is settled, the Course Guide asks this before any Starting Level check. */
const KNOW = "How much do you know about this already?";

/** Library rows the Learner sees on Home. */
async function library(page: Page) {
  const response = await page.request.get("/api/library");
  return (await response.json() as { items: { id: string; kind: string; title: string }[] }).items;
}

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
  // Validity passes and the goal is looked at, with no button in between; then the Learner says how much they know.
  await page.getByRole("group", { name: KNOW }).getByRole("button", { name: /^I know some of it/ }).click({ timeout: 15_000 });
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
  await expect(page.getByRole("group", { name: KNOW })).toBeVisible({ timeout: 15_000 });
});

test("None of these opens a new course with the topic and takes the unanswered one off Home", async ({ page }) => {
  await resetFixture();
  await compose(page, "How to feed unicorns");
  await expect(page.getByRole("group", { name: QUESTION })).toBeVisible({ timeout: 10_000 });
  const originalId = page.url().split("/").at(-1)!;
  expect((await library(page)).some((item) => item.id === originalId)).toBe(true);

  await page.getByRole("group", { name: QUESTION }).getByRole("button", { name: /^None of these/ }).click();
  await expect(page.getByLabel("What would you like to learn?")).toHaveValue("How to feed unicorns");
  expect((await library(page)).some((item) => item.id === originalId)).toBe(false);
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

test("Back from a topic saved straight away returns to where the Learner was, without a second course", async ({ page }) => {
  await resetFixture();
  await page.goto("/");
  await page.goto("/new-course-request?topic=Sourdough%20bread");
  await expect(page).toHaveURL(/\/course-requests\//);
  await expect(page.getByRole("log").getByText(/^You: ?Sourdough bread$/)).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/new-course-request|course-requests/);
  // Give a stray preset time to save, had Back landed on it.
  await page.waitForTimeout(1_000);
  const saved = (await library(page)).filter((item) => item.kind === "course_request" && item.title === "Sourdough bread");
  expect(saved).toHaveLength(1);
});
