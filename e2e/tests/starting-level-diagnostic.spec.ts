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

/** The current question group. */
function question(page: Page, n: number) {
  return page.getByRole("group", { name: `Question ${n} of 8` });
}

/** Answers question n (1-based): its key (option "Right n") or I don't know, then moves on. */
async function answer(page: Page, n: number, correct: boolean) {
  const group = question(page, n);
  await group.getByRole("radio", { name: correct ? `Right ${n}` : "I don’t know" }).check();
  if (n < 8) await page.getByRole("button", { name: "Next" }).click();
}

test("One item per screen, answers survive a reload, and Too easy widens the gap before Looks right", async ({ page }) => {
  await page.goto(await passedRequest());
  await expect(page.getByText("It is not a Quiz, not a grade")).toBeVisible();
  await page.getByRole("button", { name: "Start the check" }).click();

  await expect(question(page, 1)).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  for (const n of [1, 2, 3]) await answer(page, n, true);
  await expect(question(page, 4)).toBeVisible();

  await page.reload();
  await expect(question(page, 4)).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(question(page, 3).getByRole("radio", { name: "Right 3" })).toBeChecked();
  await page.getByRole("button", { name: "Next" }).click();

  for (const n of [4, 5, 6, 7, 8]) await answer(page, n, false);
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(page.getByText("Your Course would start at Fixture capability 4.")).toBeVisible();
  await expect(page.getByText("Fixture coverage note.")).toBeVisible();
  await expect(page.getByText(/Right \d|%/)).toHaveCount(0);
  await page.getByRole("button", { name: /Too easy/ }).click();
  await expect(page.getByText("Your Course would start at Fixture capability 1.")).toBeVisible();
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page.getByText("Your starting point is confirmed.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Your starting point is confirmed.")).toBeVisible();
});

test("Nearly everything right offers a short Course or a new goal, and Too easy returns the ordinary choice", async ({ page }) => {
  await page.goto(await passedRequest());
  await page.getByRole("button", { name: "Start the check" }).click();
  for (let n = 1; n <= 8; n += 1) await answer(page, n, true);
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(page.getByRole("button", { name: "Make me a short Course" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change my goal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Looks right" })).toHaveCount(0);

  await page.getByRole("button", { name: /Too easy/ }).click();
  await expect(page.getByRole("button", { name: "Looks right" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make me a short Course" })).toHaveCount(0);
});

test("Change my goal opens an editable new Request with the same goal", async ({ page }) => {
  await page.goto(await passedRequest());
  await page.getByRole("button", { name: "Start the check" }).click();
  for (let n = 1; n <= 8; n += 1) await answer(page, n, true);
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("button", { name: "Change my goal" }).click();
  await expect(page.getByLabel("Learning Goal")).toHaveValue("Play Iris by the Goo Goo Dolls");
  await expect(page.getByRole("link", { name: "View original request" })).toBeVisible();
});
