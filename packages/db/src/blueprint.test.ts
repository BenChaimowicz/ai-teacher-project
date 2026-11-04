import assert from "node:assert/strict";
import { test } from "node:test";
import { blueprintChapters, blueprintCodeFailures, goalCheckSlot, learnerBlueprint, type BlueprintSlot, type CourseBlueprint } from "./blueprint.ts";

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

/**
 * A Goal Check slot (SEN-81) whose goal objectives map to the given Reading slot numbers.
 * @param taught - Each goal objective's teaching Reading numbers, by objective
 */
function goalCheck(taught: Record<string, number[]>): BlueprintSlot {
  const objectiveSlotIds = Object.fromEntries(Object.entries(taught).map(([objective, numbers]) => [objective, numbers.map((number) => `slot${number}`)]));
  return {
    id: "goal", method: "goal_check", title: "Goal Check: read 6/8", lessonGoal: "Count and feel any 6/8 bar of Iris.",
    objectives: Object.keys(taught), topicTags: ["meter", "goal-check"],
    assessesSlotIds: [...new Set(Object.values(objectiveSlotIds).flat())], objectiveSlotIds,
  };
}

/** One Module holding the given slots and nothing else. */
function bare(...slots: BlueprintSlot[]): CourseBlueprint {
  return { courseTitle: "Reading 6/8 for Iris", modules: [{ title: "Counting in six", slots }] };
}

/** One Module holding the given slots, then a valid Goal Check over its first and last Readings. */
function course(...slots: BlueprintSlot[]): CourseBlueprint {
  const readings = slots.filter((slot) => slot.method === "reading").map((slot) => Number(slot.id.slice("slot".length)));
  const [first, last] = [readings[0] ?? 1, readings.at(-1) ?? 1];
  return bare(...slots, goalCheck({ "Count 6/8 aloud": [first], "Feel 6/8 in two": [last] }));
}

/** Two Readings and a Quiz that assesses both, then the Goal Check: the default cadence's smallest Course. */
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

test("Two Readings followed by a Quiz that assesses them, then the Goal Check, passes the Code checks", () => {
  assert.deepEqual(failures(valid()), []);
  assert.equal(goalCheckSlot(valid())?.id, "goal");
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
  assert.ok(failures(course(reading(1), quiz(2, [1]))).some((failure) => failure.includes("3–30 Lessons before its Goal Check, not 2")));
  /** Readings in pairs, each pair followed by its Quiz, `pairs` times over. */
  const paired = (pairs: number) => course(...Array.from({ length: pairs }, (_, pair) => {
    const first = pair * 3 + 1;
    return [reading(first), reading(first + 1), quiz(first + 2, [first, first + 1])];
  }).flat());
  assert.ok(failures(paired(11)).some((failure) => failure.includes("3–30 Lessons before its Goal Check, not 33")));
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
  assert.deepEqual(view.modules[0]!.slots[3], { id: "goal", method: "goal_check", title: "Goal Check: read 6/8", lessonGoal: "Count and feel any 6/8 bar of Iris." },
    "The Goal Check shows as the Course's last item, without its objectives or the Readings they map to.");
  assert.deepEqual(Object.keys(view.modules[0]!.slots[0]!).sort(), ["id", "lessonGoal", "method", "title"]);
});

/** The three Lessons of {@link valid}, without its Goal Check. */
function lessons(): BlueprintSlot[] {
  return [reading(1), reading(2), quiz(3, [1, 2])];
}

test("A Course ends with exactly one Goal Check, as its very last slot (SEN-81)", () => {
  assert.ok(failures(bare(...lessons())).some((failure) => failure.includes("exactly one Goal Check, not 0")));
  const check = goalCheck({ "Count 6/8 aloud": [1], "Feel 6/8 in two": [2] });
  assert.ok(failures(bare(...lessons(), check, { ...check, id: "goal2", lessonGoal: "Another goal." }))
    .some((failure) => failure.includes("exactly one Goal Check, not 2")));
  const [first, second, third] = lessons();
  assert.ok(failures(bare(first!, second!, check, third!)).some((failure) => failure.includes("must be the Course's last Lesson")));
  const twoModules: CourseBlueprint = {
    courseTitle: "Reading 6/8 for Iris",
    modules: [{ title: "Counting in six", slots: [...lessons(), check] }, { title: "More", slots: [reading(4), quiz(5, [4])] }],
  };
  assert.ok(failures(twoModules).some((failure) => failure.includes("must be the Course's last Lesson")));
});

test("A Goal Check lists 2–6 distinct goal objectives (SEN-81)", () => {
  assert.ok(failures(bare(...lessons(), goalCheck({ "Count 6/8 aloud": [1] }))).some((failure) => failure.includes("2–6 goal objectives, not 1")));
  const seven = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`Goal ${i}`, [1]]));
  assert.ok(failures(bare(...lessons(), goalCheck(seven))).some((failure) => failure.includes("2–6 goal objectives, not 7")));
  const six = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`Goal ${i}`, [1 + (i % 2)]]));
  assert.deepEqual(failures(bare(...lessons(), goalCheck(six))), []);
  const repeated = goalCheck({ "Count 6/8 aloud": [1], "count 6/8 aloud ": [2] });
  assert.ok(failures(bare(...lessons(), repeated)).some((failure) => failure.includes("repeats a goal objective")));
});

test("Every goal objective is mapped to earlier Readings that teach it, and nothing else is mapped (SEN-81)", () => {
  const unmapped = { ...goalCheck({ "Count 6/8 aloud": [1], "Feel 6/8 in two": [2] }), objectives: ["Count 6/8 aloud", "Feel 6/8 in two", "Play the verse"] };
  assert.ok(failures(bare(...lessons(), unmapped)).some((failure) => failure.includes("name the teaching Readings for each")));
  assert.ok(failures(bare(...lessons(), unmapped)).some((failure) => failure.includes("“Play the verse” is taught by no Reading")));
  const extra = { ...goalCheck({ "Count 6/8 aloud": [1], "Feel 6/8 in two": [2], "Play the verse": [2] }), objectives: ["Count 6/8 aloud", "Feel 6/8 in two"] };
  assert.ok(failures(bare(...lessons(), extra)).some((failure) => failure.includes("and nothing else")));
  const empty = goalCheck({ "Count 6/8 aloud": [1], "Feel 6/8 in two": [] });
  assert.ok(failures(bare(...lessons(), empty)).some((failure) => failure.includes("“Feel 6/8 in two” is taught by no Reading")));
  const toQuiz = goalCheck({ "Count 6/8 aloud": [1], "Feel 6/8 in two": [3] });
  assert.ok(failures(bare(...lessons(), toQuiz)).some((failure) => failure.includes("names slot3, which is not an earlier Reading")));
  const missing = goalCheck({ "Count 6/8 aloud": [1], "Feel 6/8 in two": [9] });
  assert.ok(failures(bare(...lessons(), missing)).some((failure) => failure.includes("names slot9, which is not an earlier Reading")));
  const toItself = { ...goalCheck({ "Count 6/8 aloud": [1], "Feel 6/8 in two": [2] }), objectiveSlotIds: { "Count 6/8 aloud": ["slot1"], "Feel 6/8 in two": ["goal"] } };
  assert.ok(failures(bare(...lessons(), toItself)).some((failure) => failure.includes("names goal, which is not an earlier Reading")));
  // A Reading after the Goal Check is a later slot, even though the Goal Check is then not last.
  const later = bare(...lessons(), goalCheck({ "Count 6/8 aloud": [1], "Feel 6/8 in two": [4] }), reading(4));
  assert.ok(failures(later).some((failure) => failure.includes("names slot4, which is not an earlier Reading")));
});

test("A Goal Check assesses exactly the Readings its goal objectives name (SEN-81)", () => {
  const check = goalCheck({ "Count 6/8 aloud": [1], "Feel 6/8 in two": [1] });
  assert.deepEqual(failures(bare(...lessons(), check)), [], "Two objectives may share a Reading.");
  assert.ok(failures(bare(...lessons(), { ...check, assessesSlotIds: ["slot1", "slot2"] })).some((failure) => failure.includes("assess exactly the Readings")));
  assert.ok(failures(bare(...lessons(), { ...check, assessesSlotIds: [] })).some((failure) => failure.includes("assess exactly the Readings")));
  const quizWithMap = withSlot(2, { objectiveSlotIds: { "Objective 1": ["slot1"] } });
  assert.ok(failures(quizWithMap).some((failure) => failure.includes("Slot 3 is not the Goal Check and must not map goal objectives")));
});

test("The Goal Check is not a Lesson for the Lesson count or the Quiz cadence, and plans no visuals or chapter (SEN-81)", () => {
  assert.ok(!failures(valid()).some((failure) => failure.includes("must end with a Quiz")), "The Goal Check after the last Quiz is not a trailing Lesson.");
  /** Readings in pairs, each pair followed by its Quiz, ten times over: 30 Lessons, then the Goal Check as the 31st slot. */
  const thirty = course(...Array.from({ length: 10 }, (_, pair) => {
    const first = pair * 3 + 1;
    return [reading(first, `Chapter ${pair % 3}`), reading(first + 1, `Chapter ${pair % 3}`), quiz(first + 2, [first, first + 1])];
  }).flat());
  assert.ok(!failures(thirty).some((failure) => failure.includes("Lessons before its Goal Check")), "30 Lessons and a Goal Check are within the cap.");
  assert.deepEqual(blueprintCodeFailures(course(reading(1), quiz(2, [1]), reading(3), quiz(4, [3])), "every_reading"), []);
  assert.deepEqual(blueprintCodeFailures(course(reading(1), reading(2), reading(3), quiz(4, [1, 2, 3])), "module_end"), [],
    "One Quiz in the Module: the Goal Check is not a second.");
  const check = goalCheckSlot(valid())!;
  assert.ok(failures(bare(...lessons(), { ...check, visuals: [{ kind: "diagram", intent: "A bar of 6/8." }] }))
    .some((failure) => failure.includes("not a Reading and must not plan visuals")));
  assert.equal(blueprintChapters(valid()).length, 2, "The Goal Check is in no Chapter.");
});
