import { expect, test } from "@playwright/test";
import { courseRequests, createDb, SEEDED_LEARNER_ID, startingLevelDiagnostics, type StartingLevel } from "@senoy/db";
import { resetFixture } from "./fixture.ts";

const db = createDb(process.env.DATABASE_URL!, { max: 1 });

/** Capabilities 1–3 evidenced; the gap starts at Fixture capability 4. */
const startingLevel: StartingLevel = {
  learningGoal: "Play Iris by the Goo Goo Dolls",
  probedCapabilities: Array.from({ length: 8 }, (_, i) => ({
    id: `cap${i + 1}`, statement: `Fixture capability ${i + 1}`, itemId: `item${i + 1}`, span: i + 1,
    status: i < 3 ? "correct" as const : "dont_know" as const, expandedByLearner: false,
  })),
  remainingGapStatement: "Your Course would start at Fixture capability 4.",
  coverageNote: "Fixture coverage note.",
  extremity: "mixed",
};

/** Resets the database and saves a Request whose Starting Level is confirmed. Returns its URL. */
async function confirmedRequest() {
  await resetFixture();
  const [row] = await db.insert(courseRequests).values({
    learnerId: SEEDED_LEARNER_ID, subject: "Drum kit", learningGoal: "Play Iris by the Goo Goo Dolls", status: "starting_level_confirmed",
  }).returning();
  await db.insert(startingLevelDiagnostics).values({
    courseRequestId: row!.id, learnerId: SEEDED_LEARNER_ID, startingLevel, confirmation: "looks_right",
    readyAt: new Date(), submittedAt: new Date(), confirmedAt: new Date(),
  });
  return `/course-requests/${row!.id}`;
}

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
