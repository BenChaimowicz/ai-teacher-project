import { expect, test, type Page } from "@playwright/test";
import { resetFixture } from "./fixture.ts";

/** The fixture focuser's questions (apps/api/src/lib/goal-focus-fixture.ts): a subject with "[broad]" gets one round. */
const PART = "Which part do you want the course to be about?";
const DEPTH = "How deep should it go?";
const KNOW = "How much do you know about this already?";

/** Types what to learn on New course. */
async function compose(page: Page, topic: string) {
  await page.goto("/new-course-request");
  await page.getByLabel("What would you like to learn?").fill(topic);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/course-requests\//);
}

/** Once the goal is settled: "I know some of it" takes the Starting Level check. */
async function takeCheck(page: Page) {
  await page.getByRole("group", { name: KNOW }).getByRole("button", { name: /^I know some of it/ }).click({ timeout: 15_000 });
}

/** The Starting Level check's first question. */
function levelQuestion(page: Page) {
  return page.getByRole("group", { name: "Question 1 of 8" });
}

/** The saved Request behind the page. */
async function savedRequest(page: Page) {
  const response = await page.request.get(`/api/course-requests/${page.url().split("/").at(-1)}`);
  return (await response.json() as { courseRequest: { learningGoal: string; focus: { scope: { inScope: string[]; outOfScope: string[] } | null } } }).courseRequest;
}

test("A precise goal asks nothing, says so in one line, and goes on to how much the Learner knows", async ({ page }) => {
  await resetFixture();
  await compose(page, "Drum kit");
  await expect(page.getByRole("group", { name: KNOW })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("log").getByText("That's clear. I'll aim for exactly that.")).toBeVisible();
  await expect(page.getByRole("group", { name: PART })).toHaveCount(0);
  await expect(page.getByText("Here's the course I'd make:")).toHaveCount(0);
  await takeCheck(page);
  await expect(levelQuestion(page)).toBeVisible({ timeout: 15_000 });
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
  const focusTiles = page.getByRole("group", { name: "Your course's focus" });
  await expect(focusTiles.getByRole("button", { name: /^Not quite/ })).toBeVisible();
  // The way out says which goal a broad overview would use.
  await expect(focusTiles.getByRole("button", { name: /^A broad overview is fine/ }))
    .toContainText("I'll aim for: Get the big picture of Philosophy of mind and how its main parts fit together.");
  await focusTiles.getByRole("button", { name: /^That's it/ }).click();

  // Confirming moves on to how much the Learner knows, then the check.
  await takeCheck(page);
  await expect(levelQuestion(page)).toBeVisible({ timeout: 15_000 });
  const thread = page.getByRole("log");
  await expect(thread.getByText(typedGoal)).toBeVisible();
  await expect(thread.getByText(focusedGoal)).toBeVisible();
  await expect(thread.getByText(/^You: ?That's it$/)).toBeVisible();
  await expect(thread.getByText(/^You: ?I know some of it$/)).toBeVisible();

  await page.reload();
  await expect(levelQuestion(page)).toBeVisible();
  await expect(thread.getByText(typedGoal)).toBeVisible();
  await expect(thread.getByText(/^You: ?How the parts fit together$/)).toBeVisible();
  await expect(thread.getByText(focusedGoal)).toBeVisible();
  await expect(thread.getByText(/^You: ?That's it$/)).toBeVisible();
});

test("Answers within a round survive a reload, Change my last answer steps back, and a moved entry is confirmed as left out", async ({ page }) => {
  await resetFixture();
  await compose(page, "[broad] Philosophy of mind");
  await page.getByRole("group", { name: PART }).getByRole("button", { name: "How the parts fit together" }).click({ timeout: 10_000 });
  await expect(page.getByRole("group", { name: DEPTH })).toBeVisible();

  // The round resumes where it was after a reload.
  await page.reload();
  await expect(page.getByRole("group", { name: DEPTH })).toBeVisible();
  await expect(page.getByRole("log").getByText(/^You: ?How the parts fit together$/)).toBeVisible();
  await page.getByRole("button", { name: "Change my last answer" }).click();
  await page.getByRole("group", { name: PART }).getByRole("button", { name: "How the parts fit together" }).click();
  await page.getByRole("group", { name: DEPTH }).getByRole("button", { name: "Enough to explain it to someone" }).click();

  // Each entry is a chip that moves to the other list; Covers keeps at least one.
  await expect(page.getByText("Tap an item to move it.")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Move Enough to explain it to someone to Leaves out" }).click();
  await expect(page.getByRole("region", { name: "Covers" }).getByRole("listitem")).toHaveText(["How the parts fit together"]);
  await expect(page.getByRole("region", { name: "Leaves out" }).getByRole("listitem"))
    .toHaveText(["Everything else about the subject", "Enough to explain it to someone"]);
  await expect(page.getByRole("button", { name: "Move How the parts fit together to Leaves out" })).toBeDisabled();
  await page.getByRole("group", { name: "Your course's focus" }).getByRole("button", { name: /^That's it/ }).click();

  // The confirmed card in history shows the lists as moved, and the Request keeps that scope.
  await expect(page.getByRole("group", { name: KNOW })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Tap an item to move it.")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Leaves out" }).getByRole("listitem"))
    .toHaveText(["Everything else about the subject", "Enough to explain it to someone"]);
  expect((await savedRequest(page)).focus.scope).toEqual({
    inScope: ["How the parts fit together"],
    outOfScope: ["Everything else about the subject", "Enough to explain it to someone"],
  });
});

test("A broad overview is fine skips focusing and says which goal it aims for", async ({ page }) => {
  await resetFixture();
  await compose(page, "[broad] Philosophy of mind");
  await page.getByRole("group", { name: PART }).getByRole("button", { name: /^A broad overview is fine/ }).click({ timeout: 10_000 });
  const broadGoal = "Get the big picture of Philosophy of mind and how its main parts fit together.";
  await takeCheck(page);
  await expect(levelQuestion(page)).toBeVisible({ timeout: 15_000 });
  const thread = page.getByRole("log");
  await expect(thread.getByText(/^You: ?A broad overview is fine$/)).toBeVisible();
  await expect(thread.getByText(`A broad overview it is. I'll aim for: ${broadGoal}`)).toBeVisible();
  // A skip keeps a real goal sentence, not the bare topic (fixture: apps/api/src/lib/goal-focus-fixture.ts).
  expect((await savedRequest(page)).learningGoal).toBe(broadGoal);
  await expect(page.getByText("Here's the course I'd make:")).toHaveCount(0);
});
