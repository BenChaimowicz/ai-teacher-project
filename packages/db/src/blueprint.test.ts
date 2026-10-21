import assert from "node:assert/strict";
import { test } from "node:test";
import { blueprintCodeFailures, learnerBlueprint, type BlueprintSlot, type CourseBlueprint } from "./blueprint.ts";

/** A Reading slot. */
function reading(n: number): BlueprintSlot {
  return {
    id: `slot${n}`, method: "reading", title: `Reading ${n}`, lessonGoal: `Do reading thing ${n}.`,
    objectives: [`Objective ${n}`], topicTags: ["meter", `topic-${n}`], assessesSlotIds: [],
  };
}

/** A Quiz slot assessing the given slot numbers. */
function quiz(n: number, assesses: number[]): BlueprintSlot {
  return {
    id: `slot${n}`, method: "quiz", title: `Quiz ${n}`, lessonGoal: `Show quiz thing ${n}.`,
    objectives: assesses.map((number) => `Objective ${number}`), topicTags: ["meter", "quiz"], assessesSlotIds: assesses.map((number) => `slot${number}`),
  };
}

/** One Module holding the given slots. */
function course(...slots: BlueprintSlot[]): CourseBlueprint {
  return { courseTitle: "Reading 6/8 for Iris", modules: [{ title: "Counting in six", slots }] };
}

/** Two Readings and a Quiz that assesses both: the default cadence's smallest Course. */
function valid(): CourseBlueprint {
  return course(reading(1), reading(2), quiz(3, [1, 2]));
}

/** The valid Blueprint with one slot changed. */
function withSlot(index: number, change: Partial<BlueprintSlot>): CourseBlueprint {
  const blueprint = valid();
  blueprint.modules[0]!.slots[index] = { ...blueprint.modules[0]!.slots[index]!, ...change };
  return blueprint;
}

/** Code check failures under the default cadence. */
function failures(blueprint: CourseBlueprint) {
  return blueprintCodeFailures(blueprint, "every_2_to_3_readings");
}

test("Two Readings followed by a Quiz that assesses them passes the Code checks", () => {
  assert.deepEqual(failures(valid()), []);
});

test("Every slot needs a title, Lesson goal, objectives, a registered method, and 2–5 slug Topic tags", () => {
  assert.equal(failures(withSlot(0, { title: " " })).length, 1);
  assert.equal(failures(withSlot(0, { lessonGoal: "" })).length, 1);
  assert.equal(failures(withSlot(0, { objectives: [] })).length, 1);
  assert.ok(failures(withSlot(0, { method: "podcast" as "reading" })).some((failure) => failure.includes("unregistered")));
  assert.equal(failures(withSlot(0, { topicTags: ["meter"] })).length, 1);
  assert.equal(failures(withSlot(0, { topicTags: ["a", "b", "c", "d", "e", "f"] })).length, 1);
  assert.equal(failures(withSlot(0, { topicTags: ["Compound Meter", "six"] })).length, 1);
});

test("A Quiz assesses existing, earlier Readings and lists 1–10 objectives", () => {
  assert.ok(failures(withSlot(2, { assessesSlotIds: [] })).some((failure) => failure.includes("assesses no")));
  assert.ok(failures(withSlot(2, { assessesSlotIds: ["slot1", "slot2", "slot9"] })).some((failure) => failure.includes("does not exist")));
  assert.ok(failures(withSlot(2, { assessesSlotIds: ["slot1", "slot2", "slot3"] })).some((failure) => failure.includes("precede")));
  assert.ok(failures(withSlot(2, { objectives: Array.from({ length: 11 }, (_, i) => `Objective ${i}`) }))
    .some((failure) => failure.includes("more than 10")));
  assert.ok(failures(withSlot(0, { assessesSlotIds: ["slot3"] })).some((failure) => failure.includes("not a Quiz")));
});

test("No two slots share a Lesson goal, and a Course needs at least one Reading and one Quiz", () => {
  assert.ok(failures(withSlot(2, { lessonGoal: "do reading thing 1." })).some((failure) => failure.includes("share a Lesson goal")));
  const noQuiz = course(reading(1), reading(2), reading(3));
  assert.ok(failures(noQuiz).some((failure) => failure.includes("at least one Reading and one Quiz")));
});

test("A Course holds 3–6 Lessons", () => {
  assert.ok(failures(course(reading(1), quiz(2, [1]))).some((failure) => failure.includes("3–6 Lessons, not 2")));
  const seven = course(reading(1), reading(2), quiz(3, [1, 2]), reading(4), reading(5), reading(6), quiz(7, [4, 5, 6]));
  assert.ok(failures(seven).some((failure) => failure.includes("3–6 Lessons, not 7")));
  const six = course(reading(1), reading(2), quiz(3, [1, 2]), reading(4), reading(5), quiz(6, [4, 5]));
  assert.deepEqual(failures(six), []);
});

test("Every Reading is assessed by the next Quiz, and the Module ends on a Quiz", () => {
  const skipsOne = course(reading(1), reading(2), quiz(3, [2]));
  assert.ok(failures(skipsOne).some((failure) => failure.includes("every Reading since the previous Quiz")));
  const trailing = course(reading(1), reading(2), quiz(3, [1, 2]), reading(4));
  assert.ok(failures(trailing).some((failure) => failure.includes("must end with a Quiz")));
  const cumulative = course(reading(1), reading(2), quiz(3, [1, 2]), reading(4), reading(5), quiz(6, [1, 4, 5]));
  assert.deepEqual(failures(cumulative), [], "A Quiz may also assess earlier Readings it builds on.");
});

test("Quizzes follow the Learner's Quiz cadence", () => {
  const alternating = course(reading(1), quiz(2, [1]), reading(3), quiz(4, [3]));
  assert.deepEqual(blueprintCodeFailures(alternating, "every_reading"), []);
  assert.ok(blueprintCodeFailures(alternating, "every_2_to_3_readings").some((failure) => failure.includes("asks for 2–3")));
  assert.ok(blueprintCodeFailures(alternating, "module_end").some((failure) => failure.includes("has 2 Quizzes")));

  assert.ok(blueprintCodeFailures(valid(), "every_reading").some((failure) => failure.includes("follows 2 Readings; the Quiz cadence asks for 1")));
  const fourReadings = course(reading(1), reading(2), reading(3), reading(4), quiz(5, [1, 2, 3, 4]));
  assert.ok(failures(fourReadings).some((failure) => failure.includes("follows 4 Readings")));
  assert.deepEqual(blueprintCodeFailures(fourReadings, "module_end"), []);
});

test("Learner review sees titles and Lesson goals, not objectives, tags, or assessed slots", () => {
  const view = learnerBlueprint(valid());
  assert.deepEqual(Object.keys(view.modules[0]!.slots[2]!).sort(), ["id", "lessonGoal", "method", "title"]);
});
