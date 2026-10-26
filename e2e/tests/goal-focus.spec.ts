import { expect, test, type Page } from "@playwright/test";
import { resetFixture } from "./fixture.ts";

/** The fixture focuser's questions (apps/api/src/lib/goal-focus-fixture.ts): a subject with "[broad]" gets one round. */
const PART = "Which part do you want the course to be about?";
const DEPTH = "How deep should it go?";

/** Types what to learn on New course. */
async function compose(page: Page, topic: string) {
  await page.goto("/new-course-request");
  await page.getByLabel("What would you like to learn?").fill(topic);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/course-requests\//);
}

/** The Starting Level check's first question. */
function levelQuestion(page: Page) {
  return page.getByRole("group", { name: "Question 1 of 8" });
}

test("A precise goal asks nothing and goes straight on to the Starting Level check", async ({ page }) => {
  await resetFixture();
  await compose(page, "Drum kit");
  await expect(levelQuestion(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("group", { name: PART })).toHaveCount(0);
  await expect(page.getByText("Here's the course I'd make:")).toHaveCount(0);
});

test("A broad goal is focused by tapping, the proposal is confirmed, and the thread keeps the typed goal and the focus", async ({ page }) => {
  await resetFixture();
  await compose(page, "[broad] Philosophy of mind");
  // What was typed is the topic and the goal as typed; it stays at the top after the goal is rewritten.
  const typedGoal = /^You: ?\[broad\] Philosophy of mind$/;
  const focusedGoal = "Explain how the parts fit together in Philosophy of mind";

  // One question at a time, tap to choose; "Something else" and the way out are always there.
  const part = page.getByRole("group", { name: PART });
  await expect(part).toBeVisible({ timeout: 10_000 });
  await expect(part.getByRole("button", { name: /^Something else/ })).toBeVisible();
  await expect(part.getByRole("button", { name: /^A broad overview is fine/ })).toBeVisible();
  await expect(page.getByRole("group", { name: DEPTH })).toHaveCount(0);
  await part.getByRole("button", { name: "How the parts fit together" }).click();
  await page.getByRole("group", { name: DEPTH }).getByRole("button", { name: "Enough to explain it to someone" }).click();

  // The proposal: the rewritten goal, what it covers, and what it leaves out.
  await expect(page.getByText("Here's the course I'd make:")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(focusedGoal)).toBeVisible();
  const covers = page.getByRole("region", { name: "Covers" });
  await expect(covers.getByRole("listitem")).toHaveText(["How the parts fit together", "Enough to explain it to someone"]);
  await expect(page.getByRole("region", { name: "Leaves out" }).getByRole("listitem")).toHaveText(["Everything else about the subject"]);
  await expect(page.getByRole("group", { name: "Your course's focus" }).getByRole("button", { name: /^Not quite/ })).toBeVisible();
  await page.getByRole("group", { name: "Your course's focus" }).getByRole("button", { name: /^That's it/ }).click();

  // Confirming moves on to the Starting Level check by itself.
  await expect(levelQuestion(page)).toBeVisible({ timeout: 15_000 });
  const thread = page.getByRole("log");
  await expect(thread.getByText(typedGoal)).toBeVisible();
  await expect(thread.getByText(focusedGoal)).toBeVisible();
  await expect(thread.getByText(/^You: ?That's it$/)).toBeVisible();

  await page.reload();
  await expect(levelQuestion(page)).toBeVisible();
  await expect(thread.getByText(typedGoal)).toBeVisible();
  await expect(thread.getByText(/^You: ?How the parts fit together$/)).toBeVisible();
  await expect(thread.getByText(focusedGoal)).toBeVisible();
  await expect(thread.getByText(/^You: ?That's it$/)).toBeVisible();
});

test("A broad overview is fine skips focusing and goes on to the Starting Level check", async ({ page }) => {
  await resetFixture();
  await compose(page, "[broad] Philosophy of mind");
  await page.getByRole("group", { name: PART }).getByRole("button", { name: /^A broad overview is fine/ }).click({ timeout: 10_000 });
  await expect(levelQuestion(page)).toBeVisible({ timeout: 15_000 });
  const thread = page.getByRole("log");
  await expect(thread.getByText(/^You: ?A broad overview is fine$/)).toBeVisible();
  // A skip keeps a real goal sentence, not the bare topic (fixture: apps/api/src/lib/goal-focus-fixture.ts).
  const request = await page.request.get(`/api/course-requests/${page.url().split("/").at(-1)}`);
  const { courseRequest } = await request.json() as { courseRequest: { learningGoal: string } };
  expect(courseRequest.learningGoal).toBe("Get the big picture of Philosophy of mind and how its main parts fit together.");
  await expect(page.getByText("Here's the course I'd make:")).toHaveCount(0);
});
