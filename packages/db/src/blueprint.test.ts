import assert from "node:assert/strict";
import { test } from "node:test";
import { blueprintChapters, blueprintCodeFailures, learnerBlueprint, type BlueprintSlot, type CourseBlueprint } from "./blueprint.ts";

/** A Reading slot, in a Chapter of its own unless `chapter` says otherwise. */
function reading(n: number, chapter = `Chapter ${n}`): BlueprintSlot {
  return {
    id: `slot${n}`, method: "reading", title: `Reading ${n}`, lessonGoal: `Do reading thing ${n}.`,
    objectives: [`Objective ${n}`], topicTags: ["meter", `topic-${n}`], assessesSlotIds: [], chapter,
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

test("Only a Reading plans visuals: at most two, each of a known kind with an intent (SEN-121)", () => {
  const grip = { kind: "technique" as const, intent: "Matched grip from above, so the fulcrum is seen." };
  const stroke = { kind: "diagram" as const, intent: "The four heights of a full stroke." };
  assert.deepEqual(failures(withSlot(0, { visuals: [grip, stroke] })), []);
  assert.ok(failures(withSlot(0, { visuals: [grip, stroke, grip] })).some((failure) => failure.includes("at most 2")));
  assert.ok(failures(withSlot(2, { visuals: [grip] })).some((failure) => failure.includes("not a Reading")));
  assert.ok(failures(withSlot(0, { visuals: [{ kind: "video" as "diagram", intent: "A clip." }] })).some((failure) => failure.includes("unknown kind")));
  assert.ok(failures(withSlot(0, { visuals: [{ ...grip, intent: " " }] })).some((failure) => failure.includes("no intent")));
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

test("A Course holds 3–30 Lessons in at most 6 Chapters: one-screen Readings need more of them (decision 2026-11-03)", () => {
  assert.ok(failures(course(reading(1), quiz(2, [1]))).some((failure) => failure.includes("3–30 Lessons, not 2")));
  /** Readings in pairs, each pair followed by its Quiz, `pairs` times over. */
  const paired = (pairs: number) => course(...Array.from({ length: pairs }, (_, pair) => {
    const first = pair * 3 + 1;
    return [reading(first), reading(first + 1), quiz(first + 2, [first, first + 1])];
  }).flat());
  assert.ok(failures(paired(11)).some((failure) => failure.includes("3–30 Lessons, not 33")));
  assert.ok(failures(paired(4)).some((failure) => failure.includes("at most 6 Chapters, not 8")));
  const fourteen = course(
    reading(1, "A"), reading(2, "A"), reading(3, "B"), reading(4, "B"), quiz(5, [1, 2, 3, 4]),
    reading(6, "C"), reading(7, "C"), reading(8, "C"), reading(9, "D"), quiz(10, [6, 7, 8, 9]),
    reading(11, "E"), reading(12, "E"), reading(13, "F"), quiz(14, [11, 12, 13]),
  );
  assert.deepEqual(failures(fourteen), []);
});

test("A Chapter's Readings sit together, name their chapter, and number at most 4 (decision 2026-11-03)", () => {
  const split = course(reading(1, "A"), reading(2, "B"), reading(3, "A"), quiz(4, [1, 2, 3]));
  assert.ok(failures(split).some((failure) => failure.includes("Chapter “A” is split")));
  const quizInside = course(reading(1, "A"), quiz(2, [1]), reading(3, "A"), reading(4, "B"), quiz(5, [3, 4]));
  assert.ok(failures(quizInside).some((failure) => failure.includes("Chapter “A” is split")));
  const unnamed = course(reading(1, ""), reading(2, "B"), quiz(3, [1, 2]));
  assert.ok(failures(unnamed).some((failure) => failure.includes("Slot 1 is a Reading that names no chapter")));
  const fat = course(reading(1, "A"), reading(2, "A"), reading(3, "A"), reading(4, "A"), reading(5, "A"), reading(6, "B"), quiz(7, [1, 2, 3, 4, 5, 6]));
  assert.ok(failures(fat).some((failure) => failure.includes("Chapter “A” has 5 Readings")));
  assert.deepEqual(blueprintChapters(fourteenChapters()).map((chapter) => [chapter.title, chapter.slots.map((slot) => slot.id)]), [
    ["A", ["slot1", "slot2"]], ["B", ["slot3"]],
  ]);
});

/** Two Chapters, one of two Readings and one of one, then their Quiz. */
function fourteenChapters(): CourseBlueprint {
  return course(reading(1, "A"), reading(2, " a "), reading(3, "B"), quiz(4, [1, 2, 3]));
}

test("The Quiz cadence counts Chapters, not Readings (decision 2026-11-03)", () => {
  const twoChapters = course(reading(1, "A"), reading(2, "A"), reading(3, "A"), reading(4, "B"), quiz(5, [1, 2, 3, 4]));
  assert.deepEqual(failures(twoChapters), [], "Four Readings in two Chapters satisfy every 2–3.");
  const oneChapter = course(reading(1, "A"), reading(2, "A"), reading(3, "A"), quiz(4, [1, 2, 3]));
  assert.ok(failures(oneChapter).some((failure) => failure.includes("follows 1 Chapters; the Quiz cadence asks for 2–3")));
  assert.deepEqual(blueprintCodeFailures(oneChapter, "every_reading"), [], "One Chapter per Quiz is 'after every reading' now.");
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

  assert.ok(blueprintCodeFailures(valid(), "every_reading").some((failure) => failure.includes("follows 2 Chapters; the Quiz cadence asks for 1")));
  const fourReadings = course(reading(1), reading(2), reading(3), reading(4), quiz(5, [1, 2, 3, 4]));
  assert.ok(failures(fourReadings).some((failure) => failure.includes("follows 4 Chapters")));
  assert.deepEqual(blueprintCodeFailures(fourReadings, "module_end"), []);
});

test("Learner review sees titles and Lesson goals, not objectives, tags, assessed slots, or planned visuals", () => {
  const view = learnerBlueprint(withSlot(0, { visuals: [{ kind: "technique", intent: "Matched grip from above." }] }));
  assert.deepEqual(Object.keys(view.modules[0]!.slots[2]!).sort(), ["id", "lessonGoal", "method", "title"]);
  assert.deepEqual(Object.keys(view.modules[0]!.slots[0]!).sort(), ["id", "lessonGoal", "method", "title"]);
});
