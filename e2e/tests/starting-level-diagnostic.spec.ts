import { expect, test, type Page } from "@playwright/test";
import { courseRequests, createDb, SEEDED_LEARNER_ID } from "@senoy/db";
import { resetFixture } from "./fixture.ts";

const db = createDb(process.env.DATABASE_URL!, { max: 1 });

/** Resets the database and saves a Request that has passed the Validity gate. Returns its URL. */
async function passedRequest() {
  await resetFixture();
  const [row] = await db.insert(courseRequests).values({
    learnerId: SEEDED_LEARNER_ID, subject: "Drum kit", learningGoal: "Play Iris by the Goo Goo Dolls", status: "validity_passed",
  }).returning();
  return `/course-requests/${row!.id}`;
}

/** "How much do you know about this already?", asked before any check. */
function knowAsk(page: Page) {
  return page.getByRole("group", { name: "How much do you know about this already?" });
}

/** "I know some of it" prepares the check. */
async function takeCheck(page: Page) {
  await knowAsk(page).getByRole("button", { name: /^I know some of it/ }).click({ timeout: 15_000 });
}

/** The current question's tiles. */
function question(page: Page, n: number) {
  return page.getByRole("group", { name: `Question ${n} of 8` });
}

/** Answers question n (1-based) by tapping its key (option "Right n") or I don't know. */
async function answer(page: Page, n: number, correct: boolean) {
  await question(page, n).getByRole("button", { name: correct ? `Right ${n}` : /^I don't know/ }).click();
}

test("I know some of it prepares the check; one question at a time, answers survive a reload, and Start a bit earlier widens the gap before Looks right", async ({ page }) => {
  await page.goto(await passedRequest());
  await takeCheck(page);
  await expect(page.getByText("It's not a quiz or a grade")).toBeVisible();
  await expect(page.getByText("You'll see the plan before anything is written.")).toBeVisible();
  await expect(question(page, 1)).toBeVisible();
  for (const n of [1, 2, 3]) await answer(page, n, true);
  await expect(question(page, 4)).toBeVisible();

  await page.reload();
  await expect(question(page, 4)).toBeVisible();
  await expect(page.getByRole("log").getByText("Right 3")).toBeVisible();
  await page.getByRole("button", { name: "Change my last answer" }).click();
  await expect(question(page, 3)).toBeVisible();
  await answer(page, 3, true);

  // The last answer sends them all.
  for (const n of [4, 5, 6, 7, 8]) await answer(page, n, false);
  await expect(page.getByText("Your Course would start at Fixture capability 4.")).toBeVisible();
  await expect(page.getByText("Fixture coverage note.")).toBeVisible();
  await expect(page.getByText(/Right \d|%/)).toHaveCount(0);
  await page.getByRole("button", { name: /^Start a bit earlier/ }).click();
  await expect(page.getByText("Your Course would start at Fixture capability 1.")).toBeVisible();
  await page.getByRole("button", { name: /^Looks right/ }).click();

  // Confirming starts the plan by itself.
  await expect(page.getByText("Here's a plan. Your call.")).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByText("Your Course would start at Fixture capability 1.")).toBeVisible();
  await expect(page.getByRole("log").getByText("Looks right")).toBeVisible();
});

test("Nearly everything right offers a short course or a new goal, and Start a bit earlier returns the ordinary choice", async ({ page }) => {
  await page.goto(await passedRequest());
  await takeCheck(page);
  for (let n = 1; n <= 8; n += 1) await answer(page, n, true);

  await expect(page.getByRole("button", { name: /^Make me a short course/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Change my goal/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Looks right/ })).toHaveCount(0);

  await page.getByRole("button", { name: /^Start a bit earlier/ }).click();
  await expect(page.getByRole("button", { name: /^Looks right/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Make me a short course/ })).toHaveCount(0);
});

test("Change my goal reopens the goal in a new Request linked to the original", async ({ page }) => {
  await page.goto(await passedRequest());
  await takeCheck(page);
  for (let n = 1; n <= 8; n += 1) await answer(page, n, true);
  await page.getByRole("button", { name: /^Change my goal/ }).click();
  await expect(page.getByLabel("What would you like to learn?")).toHaveValue("Play Iris by the Goo Goo Dolls");
  await expect(page.getByRole("link", { name: "View original request" })).toBeVisible();
});

test("Brand new to this skips the questions and goes on to the plan, on the Learner's own word", async ({ page }) => {
  await page.goto(await passedRequest());
  await knowAsk(page).getByRole("button", { name: /^Brand new to this/ }).click({ timeout: 15_000 });

  // The plan is designed by itself next (fixture Blueprint); no question was ever asked.
  await expect(page.getByText("Here's a plan. Your call.")).toBeVisible({ timeout: 15_000 });
  const thread = page.getByRole("log");
  await expect(thread.getByText(/^You: ?Brand new to this$/)).toBeVisible();
  await expect(thread.getByText("You're new to this, so the course starts from the very beginning.")).toBeVisible();
  await expect(page.getByRole("group", { name: /^Question \d of 8$/ })).toHaveCount(0);
  await expect(page.getByText("It's not a quiz or a grade")).toHaveCount(0);
  await expect(page.getByText("This is a small sample")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Here's a plan. Your call.")).toBeVisible();
  await expect(thread.getByText(/^You: ?Brand new to this$/)).toBeVisible();
  await expect(thread.getByText(/questions answered/)).toHaveCount(0);
});
