import assert from "node:assert/strict";
import { test } from "node:test";
import { blueprintCodeFailures, learnerBlueprint, type BlueprintSlot, type CourseBlueprint } from "./blueprint.ts";

/** One Reading followed by a Quiz that assesses it. */
function valid(): CourseBlueprint {
  return {
    courseTitle: "Reading 6/8 for Iris",
    modules: [{
      title: "Counting in six",
      slots: [
        {
          id: "slot1", method: "reading", title: "Feeling 6/8", lessonGoal: "Count a 6/8 bar in two groups of three.",
          objectives: ["Explain compound meter", "Count 6/8 aloud"], topicTags: ["compound-meter", "6-8-time"], assessesSlotIds: [],
        },
        {
          id: "slot2", method: "quiz", title: "Check: 6/8", lessonGoal: "Show you can count and recognise 6/8.",
          objectives: ["Explain compound meter"], topicTags: ["compound-meter", "quiz"], assessesSlotIds: ["slot1"],
        },
      ],
    }],
  };
}

/** The valid Blueprint with one slot changed. */
function withSlot(index: number, change: Partial<BlueprintSlot>): CourseBlueprint {
  const blueprint = valid();
  blueprint.modules[0]!.slots[index] = { ...blueprint.modules[0]!.slots[index]!, ...change };
  return blueprint;
}

test("One Reading followed by a Quiz that assesses it passes the Code checks", () => {
  assert.deepEqual(blueprintCodeFailures(valid()), []);
});

test("Every slot needs a title, Lesson goal, objectives, a registered method, and 2–5 slug Topic tags", () => {
  assert.equal(blueprintCodeFailures(withSlot(0, { title: " " })).length, 1);
  assert.equal(blueprintCodeFailures(withSlot(0, { lessonGoal: "" })).length, 1);
  assert.equal(blueprintCodeFailures(withSlot(0, { objectives: [] })).length, 1);
  assert.ok(blueprintCodeFailures(withSlot(0, { method: "podcast" as "reading" })).some((failure) => failure.includes("unregistered")));
  assert.equal(blueprintCodeFailures(withSlot(0, { topicTags: ["meter"] })).length, 1);
  assert.equal(blueprintCodeFailures(withSlot(0, { topicTags: ["a", "b", "c", "d", "e", "f"] })).length, 1);
  assert.equal(blueprintCodeFailures(withSlot(0, { topicTags: ["Compound Meter", "six"] })).length, 1);
});

test("A Quiz assesses existing, earlier Readings and lists 1–10 objectives", () => {
  assert.ok(blueprintCodeFailures(withSlot(1, { assessesSlotIds: [] })).some((failure) => failure.includes("assesses no")));
  assert.ok(blueprintCodeFailures(withSlot(1, { assessesSlotIds: ["slot9"] })).some((failure) => failure.includes("does not exist")));
  assert.ok(blueprintCodeFailures(withSlot(1, { assessesSlotIds: ["slot2"] })).some((failure) => failure.includes("precede")));
  assert.ok(blueprintCodeFailures(withSlot(1, { objectives: Array.from({ length: 11 }, (_, i) => `Objective ${i}`) }))
    .some((failure) => failure.includes("more than 10")));
  assert.ok(blueprintCodeFailures(withSlot(0, { assessesSlotIds: ["slot2"] })).some((failure) => failure.includes("not a Quiz")));
});

test("No two slots share a Lesson goal, and the shape is exactly one Reading then one Quiz", () => {
  assert.ok(blueprintCodeFailures(withSlot(1, { lessonGoal: "count a 6/8 bar in two groups of three." }))
    .some((failure) => failure.includes("share a Lesson goal")));
  const reversed = valid();
  reversed.modules[0]!.slots.reverse();
  assert.ok(blueprintCodeFailures(reversed).some((failure) => failure.includes("exactly one Reading followed by one Quiz")));
  const twoReadings = withSlot(1, { method: "reading", assessesSlotIds: [] });
  assert.ok(blueprintCodeFailures(twoReadings).some((failure) => failure.includes("at least one Reading and one Quiz")));
});

test("Learner review sees titles and Lesson goals, not objectives, tags, or assessed slots", () => {
  const view = learnerBlueprint(valid());
  assert.deepEqual(Object.keys(view.modules[0]!.slots[1]!).sort(), ["id", "lessonGoal", "method", "title"]);
});
