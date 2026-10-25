import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createDb, learners, SEEDED_LEARNER_ID } from "@senoy/db";
import { resetFixture } from "./fixture.ts";

const db = createDb(process.env.DATABASE_URL!, { max: 1 });

/** Resets the database and removes the Learner's Teaching Profile, as on a first visit. */
async function noProfile() {
  await resetFixture();
  await db.update(learners).set({
    teachingProfileVersion: null, teachingProfileAnswers: null, teachingProfileAssessedAt: null, teachingProfileUpdatedAt: null,
  }).where(eq(learners.id, SEEDED_LEARNER_ID));
}

/** The saved answers. */
async function savedAnswers() {
  const [row] = await db.select({ answers: learners.teachingProfileAnswers }).from(learners).where(eq(learners.id, SEEDED_LEARNER_ID));
  return row?.answers ?? null;
}

/** Taps one tile in the question asked by `ask`. */
async function tap(page: Page, ask: string | RegExp, tile: RegExp) {
  await page.getByRole("group", { name: ask }).getByRole("button", { name: tile }).click();
}

test("First run asks seven tapped questions with a live summary, saves the SEN-33 shape, and a line can be changed", async ({ page }) => {
  await noProfile();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/teaching-profile");
  await expect(page.getByText("No right answers. You can skip any question and change any of this later.")).toBeVisible();
  await page.getByRole("button", { name: /^Let's do it/ }).click();

  const panel = page.getByRole("complementary", { name: "Your answers so far" });
  const reading = page.getByRole("group", { name: /^Anything that makes reading easier/ });
  await reading.getByRole("button", { name: "Plain, direct wording" }).click();
  await reading.getByRole("button", { name: /^That's it/ }).click();
  await expect(panel.getByText("plain wording")).toBeVisible();

  await tap(page, "How much should one lesson cover?", /^One key idea/);
  await tap(page, "How should a lesson move along?", /^No preference/);
  await tap(page, "When there's a good example, what comes first?", /^Skip this one/);
  await tap(page, "How often would you like a quick check?", /^After every lesson/);
  await tap(page, "In a quiz, when should I show the answer?", /^After the whole quiz/);
  await tap(page, "And how much explanation with each answer?", /^Detailed/);
  await expect(page.getByText("That's everything.")).toBeVisible();

  // The language question is never asked; it stays skipped and resolves to English.
  await expect(page.getByText(/language/i)).toHaveCount(0);
  expect(await savedAnswers()).toEqual({
    instructionLanguage: { status: "skipped" },
    requiredReadingSupports: { status: "declared", value: ["plain_language"] },
    contentScope: { status: "selected", value: "compact" },
    sectionAdvance: { status: "no_preference" },
    explanationOrder: { status: "skipped" },
    quizCadence: { status: "selected", value: "every_reading" },
    feedbackTiming: { status: "selected", value: "end_of_quiz" },
    feedbackDepth: { status: "selected", value: "detailed" },
  });

  await panel.getByRole("button", { name: /^Change lesson size/ }).click();
  await tap(page, "How much should one lesson cover?", /^The fuller story/);
  await expect(page.getByText(/^Updated\./)).toBeVisible();
  await expect(panel.getByText("long", { exact: true })).toBeVisible();
  expect((await savedAnswers())?.contentScope).toEqual({ status: "selected", value: "extended" });

  await page.getByRole("button", { name: /^Make my first course/ }).click();
  await expect(page.getByLabel("What would you like to learn?")).toBeVisible();
});

test("Use the defaults saves every question as skipped and unblocks New course", async ({ page }) => {
  await noProfile();
  await page.goto("/new-course-request");
  await page.getByRole("button", { name: /^Set it up/ }).click();
  await page.getByRole("button", { name: /^Use the defaults for now/ }).click();
  await expect(page.getByText("Done. I'll use the defaults")).toBeVisible();
  const answers = await savedAnswers();
  expect(Object.values(answers ?? {}).every((answer) => (answer as { status: string }).status === "skipped")).toBe(true);
  await page.getByRole("button", { name: /^Make my first course/ }).click();
  await expect(page.getByLabel("What would you like to learn?")).toBeVisible();
});

test("Returning shows each setting with a change button; a change saves at once, and Reset asks first", async ({ page }) => {
  await resetFixture({ contentScope: { status: "selected", value: "compact" } });
  await page.goto("/teaching-profile");
  await expect(page.getByRole("heading", { name: "How you like to learn" })).toBeVisible();
  const settings = page.getByRole("list", { name: "Your settings" });
  await expect(settings.getByText("short", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Change pacing" }).click();
  await tap(page, "How should a lesson move along?", /^Pause after each section/);
  await expect(page.getByText(/^Updated\./)).toBeVisible();
  await expect(settings.getByText("section by section")).toBeVisible();
  const answers = await savedAnswers();
  expect(answers?.sectionAdvance).toEqual({ status: "selected", value: "manual" });
  expect(answers?.contentScope).toEqual({ status: "selected", value: "compact" });

  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Reset to defaults/ }).click();
  await page.getByRole("dialog", { name: "Reset to defaults?" }).getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("button", { name: /^Let's do it/ })).toBeVisible();
  expect(await savedAnswers()).toBeNull();
});
