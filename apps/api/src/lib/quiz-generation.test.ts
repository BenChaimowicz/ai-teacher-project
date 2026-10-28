import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlueprintSlot } from "@senoy/db/blueprint";
import { parseQuizBody } from "@senoy/db/quiz";
import type { Generator, Judge, StructuredRequest, ModelReply } from "./model-ports.ts";
import { createQuizGenerator, QuizFailedError, type AssessedLesson, type QuizInput } from "./quiz-generation.ts";
import { QUIZ_STYLE } from "./teaching-style.ts";

const READING_SLOT: BlueprintSlot = {
  id: "slot1", method: "reading", title: "The World Tree", lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.",
  objectives: ["Describe Yggdrasil", "Name its roots"], topicTags: ["yggdrasil", "nine-worlds"], assessesSlotIds: [],
};

const QUIZ_SLOT: BlueprintSlot = {
  id: "slot2", method: "quiz", title: "Check: the World Tree", lessonGoal: "Recall how Yggdrasil connects the worlds.",
  objectives: ["Describe Yggdrasil", "Name its roots"], topicTags: ["yggdrasil", "quiz"], assessesSlotIds: ["slot1"],
};

const READING: AssessedLesson = {
  slotId: "slot1", title: READING_SLOT.title, lessonGoal: READING_SLOT.lessonGoal, objectives: READING_SLOT.objectives,
  body: { sections: [{ heading: "The tree", blocks: [{ kind: "prose", text: "Yggdrasil is the world tree [1]. It has three roots [2][1]." }] }] },
};

const INPUT: QuizInput = {
  courseTitle: "Norse cosmology",
  learningGoal: "Explain the Norse picture of the world",
  scope: null,
  slot: QUIZ_SLOT,
  slots: [READING_SLOT, QUIZ_SLOT],
  assessed: [READING],
  profile: { instructionLanguage: "en" },
};

/** One authored item for `objective`. */
function item(n: number, objective = n % 2 ? "Describe Yggdrasil" : "Name its roots") {
  return {
    objective,
    prompt: `Question ${n} about Yggdrasil?`,
    options: [
      { id: "opt1", text: `Right ${n}`, correct: true },
      ...["a", "b", "c"].map((letter, index) => ({ id: `opt${index + 2}`, text: `Wrong ${n}${letter}`, correct: false })),
    ],
    explanations: { brief: `Brief ${n}.`, standard: `Standard ${n}.`, detailed: `Detailed ${n}.` },
  };
}

/** An authored Quiz of `count` items. */
function authored(count = 6, objective?: string) {
  return { items: Array.from({ length: count }, (_, index) => item(index + 1, objective)) };
}

/** Scripted Generator: one output per call, repeating the last; records what it was shown. */
function scriptedGenerator(...outputs: unknown[]) {
  const calls: StructuredRequest<unknown>[] = [];
  const generator: Generator = {
    modelId: "fixture/author",
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      calls.push(request as StructuredRequest<unknown>);
      return { value: request.parse(outputs[Math.min(calls.length, outputs.length) - 1]), modelId: "fixture/author" };
    },
  };
  return { generator, calls };
}

const PASS = { pass: true, failedChecks: [], reasons: [] };

/** One objective's grounding verdict, as the grounding call returns it. */
type Grounded = { verdict: string; text?: string; reason?: string };

/**
 * Scripted Judge: one Quiz verdict per call, repeating the last; records what it was shown. Objective grounding calls
 * are recorded apart and support every objective unless `grounded` holds another verdict for it.
 */
function scriptedJudge(...verdicts: unknown[]) {
  const calls: (StructuredRequest<unknown> & { authorModelIds: readonly string[] })[] = [];
  const groundings: (StructuredRequest<unknown> & { authorModelIds: readonly string[] })[] = [];
  const grounded = new Map<string, Grounded>();
  const judge: Judge = {
    modelId: "fixture/judge",
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
      if (request.schemaName === "objective_grounding") {
        groundings.push(request as StructuredRequest<unknown> & { authorModelIds: readonly string[] });
        const { objectives } = (request.input as { slot: { objectives: string[] } }).slot;
        return {
          value: request.parse({
            objectives: objectives.map((objective) => ({
              objective, verdict: "supported", text: "", reason: "", ...grounded.get(objective),
            })),
          }),
          modelId: "fixture/judge",
        };
      }
      calls.push(request as StructuredRequest<unknown> & { authorModelIds: readonly string[] });
      return { value: request.parse(verdicts.length ? verdicts[Math.min(calls.length, verdicts.length) - 1] : PASS), modelId: "fixture/judge" };
    },
  };
  return { judge, calls, groundings, grounded };
}

test("Authored items become a Quiz body the Quiz plugin accepts, each with one key among four options", async () => {
  const { generator } = scriptedGenerator(authored());
  const { judge, calls } = scriptedJudge();
  const { lesson, judge: verdict, repairs } = await createQuizGenerator({ generator, judge }).generate(INPUT);

  assert.equal(verdict.pass, true);
  assert.equal(repairs, 0);
  assert.equal(lesson.teachingMethod, "quiz");
  assert.equal(lesson.slotId, "slot2");
  assert.equal(lesson.lineage, null);
  assert.deepEqual([lesson.sources, lesson.citations], [[], []]);
  assert.deepEqual(Object.keys(lesson.body), ["items"], "No reading sections and no media.");
  assert.deepEqual(parseQuizBody(lesson.body), lesson.body);
  for (const [index, quizItem] of lesson.body.items.entries()) {
    assert.equal(quizItem.id, `item${index + 1}`);
    assert.deepEqual(quizItem.options.map((option) => option.id), ["a", "b", "c", "d"]);
    assert.equal(quizItem.options.find((option) => option.id === quizItem.correctOptionId)!.text, `Right ${index + 1}`);
    assert.equal(quizItem.explanations.detailed, `Detailed ${index + 1}.`);
  }
  // The answer's position follows the question, not the author's habit of writing it first.
  assert.ok(new Set(lesson.body.items.map((quizItem) => quizItem.correctOptionId)).size > 1);
  assert.deepEqual(calls[0]!.authorModelIds, ["fixture/author"]);
});

test("The author and Judge read the assessed Lesson without Citation markers; the Judge sees each key", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge, calls: judgeCalls } = scriptedJudge();
  await createQuizGenerator({ generator, judge }).generate(INPUT);

  const told = calls[0]!.input as { lessons: { sections: { paragraphs: string[] }[] }[]; slot: { objectives: string[] }; profile: unknown };
  assert.deepEqual(told.lessons[0]!.sections[0]!.paragraphs, ["Yggdrasil is the world tree. It has three roots."]);
  assert.deepEqual(told.slot.objectives, QUIZ_SLOT.objectives);
  assert.deepEqual(told.profile, { instructionLanguage: "en" });
  assert.deepEqual((calls[0]!.schema as { properties: { items: { items: { properties: { objective: { enum: string[] } } } } } })
    .properties.items.items.properties.objective.enum, QUIZ_SLOT.objectives);

  const shown = judgeCalls[0]!.input as { lessons: unknown; items: { n: number; key: string; options: Record<string, string> }[] };
  assert.deepEqual(shown.lessons, told.lessons);
  assert.equal(shown.items.length, 6);
  assert.equal(shown.items[0]!.options[shown.items[0]!.key], "Right 1");
});

test("The author writes to the style guide, and the Judge accepts an invented situation the Lessons answer", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge, calls: judgeCalls } = scriptedJudge();
  await createQuizGenerator({ generator, judge }).generate(INPUT);

  assert.ok(calls[0]!.systemPrompt.includes(QUIZ_STYLE));
  assert.match(judgeCalls[0]!.systemPrompt, /invented situation in a prompt is fine when its keyed answer follows from the lessons alone/);
  assert.doesNotMatch(QUIZ_STYLE, /norse|yggdrasil/i, "Prompts stay subject-neutral (ADR 0011).");
});

test("A Judge failure is repaired once: the author sees its draft and the reasons", async () => {
  const unanswerable = { pass: false, failedChecks: ["answerable_from_lessons"], reasons: ["Item 3 asks about Odin, who is not in the lessons."] };
  const { generator, calls } = scriptedGenerator(authored(), authored(7));
  const { judge } = scriptedJudge(unanswerable, PASS);
  const { lesson, repairs } = await createQuizGenerator({ generator, judge }).generate(INPUT);

  assert.equal(repairs, 1);
  assert.equal(lesson.body.items.length, 7);
  const revision = (calls[1]!.input as { revision: { previousDraft: unknown[]; problems: string[] } }).revision;
  assert.equal(revision.previousDraft.length, 6);
  assert.deepEqual(revision.problems, unanswerable.reasons);
});

test("Deterministic failures are repaired before the Judge runs: too few items and an untested objective", async () => {
  const { generator, calls } = scriptedGenerator(authored(4, "Describe Yggdrasil"), authored());
  const { judge, calls: judgeCalls } = scriptedJudge();
  const { repairs } = await createQuizGenerator({ generator, judge }).generate(INPUT);

  assert.equal(repairs, 1);
  assert.equal(judgeCalls.length, 1, "The Judge only sees a Quiz that passed the Code checks.");
  const { problems } = (calls[1]!.input as { revision: { problems: string[] } }).revision;
  assert.ok(problems.includes("A Quiz has 5–10 items, not 4."), problems.join("\n"));
  assert.ok(problems.includes('No item assesses the objective "Name its roots".'), problems.join("\n"));
});

test("An objective the assessed Lessons do not teach is not asked about at all (ADR 0022)", async () => {
  const { generator, calls } = scriptedGenerator(authored(6, "Describe Yggdrasil"));
  const { judge, calls: judgeCalls, groundings, grounded } = scriptedJudge();
  grounded.set("Name its roots", { verdict: "unsupported", reason: "The Reading never names a root." });
  const { lesson, repairs, grounding } = await createQuizGenerator({ generator, judge }).generate(INPUT);

  // Without this, the objective leaves no passing Quiz: an item for it is not answerable from the Lessons, and no
  // item for it fails the Code coverage check.
  assert.equal(repairs, 0);
  assert.deepEqual((groundings[0]!.input as { lessons: { title: string }[] }).lessons.map((l) => l.title), [READING.title]);
  assert.deepEqual(lesson.objectives, ["Describe Yggdrasil"], "The checkpoint records what the Quiz assessed.");
  const schema = calls[0]!.schema as { properties: { items: { items: { properties: { objective: { enum: string[] } } } } } };
  assert.deepEqual(schema.properties.items.items.properties.objective.enum, ["Describe Yggdrasil"], "The author cannot write an item for it.");
  assert.deepEqual((judgeCalls[0]!.input as { slot: { objectives: string[] } }).slot.objectives, ["Describe Yggdrasil"]);
  assert.deepEqual(grounding.map(({ objective, verdict }) => [objective, verdict]), [
    ["Describe Yggdrasil", "supported"], ["Name its roots", "unsupported"],
  ]);
});

test("A rewritten objective is what the Quiz assesses, and the Judge is told untaught objectives are not its failure", async () => {
  const mixed = { items: [1, 2, 3, 4, 5, 6].map((n) => item(n, n % 2 ? "Describe Yggdrasil" : "Say that it has roots")) };
  const { generator, calls } = scriptedGenerator(mixed);
  const { judge, calls: judgeCalls, grounded } = scriptedJudge();
  grounded.set("Name its roots", { verdict: "rewritten", text: "Say that it has roots", reason: "The Reading gives no number of roots." });
  const { lesson } = await createQuizGenerator({ generator, judge }).generate(INPUT);

  assert.deepEqual(lesson.objectives, ["Describe Yggdrasil", "Say that it has roots"]);
  assert.deepEqual((calls[0]!.input as { slot: { objectives: string[] } }).slot.objectives, ["Describe Yggdrasil", "Say that it has roots"]);
  assert.match(judgeCalls[0]!.systemPrompt, /objective_coverage: .* An objective the lessons do not teach is not a failure/);
});

test("A Quiz whose Lessons teach none of its objectives fails on that one check, before any item is written", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge, calls: judgeCalls, grounded } = scriptedJudge();
  for (const objective of QUIZ_SLOT.objectives) grounded.set(objective, { verdict: "unsupported", reason: "Not taught." });
  const error = await createQuizGenerator({ generator, judge }).generate(INPUT).catch((caught: unknown) => caught);

  assert.ok(error instanceof QuizFailedError);
  assert.deepEqual(error.codeFailures, ["The Lessons this Quiz assesses teach none of its objectives."]);
  assert.equal(error.lesson, null);
  assert.deepEqual(error.rounds, [], "No draft was written, so there is no round.");
  assert.deepEqual(error.grounding.map(({ verdict }) => verdict), ["unsupported", "unsupported"]);
  assert.deepEqual([calls.length, judgeCalls.length], [0, 0], "Retry fails here again, without writing a Quiz each time.");
});

test("Explanations mention options by id, and the mention becomes the option's text wherever it lands", async () => {
  const draft = authored();
  draft.items[0]!.explanations.detailed = "{opt1} is right; {opt3} confuses the roots.";
  draft.items[1]!.explanations.brief = "{opt2} Wrong 2a is not the answer.";
  const { generator } = scriptedGenerator(draft);
  const { judge, calls } = scriptedJudge();
  const { lesson } = await createQuizGenerator({ generator, judge }).generate(INPUT);

  assert.equal(lesson.body.items[0]!.explanations.detailed, "“Right 1” is right; “Wrong 1b” confuses the roots.");
  assert.equal(lesson.body.items[1]!.explanations.brief, "“Wrong 2a” is not the answer.", "Text repeated after its mention is dropped.");
  const shown = calls[0]!.input as { items: { explanations: { detailed: string } }[] };
  assert.equal(shown.items[0]!.explanations.detailed, "“Right 1” is right; “Wrong 1b” confuses the roots.", "The Judge reads what the Learner will.");
});

test("A mention of a missing option, or a repeated option id, fails the Code checks", async () => {
  const draft = authored();
  draft.items[0]!.explanations.brief = "{opt9} is wrong.";
  draft.items[1]!.options[1]!.id = "opt1";
  const { generator } = scriptedGenerator(draft);
  const { judge, calls } = scriptedJudge();
  const error = await createQuizGenerator({ generator, judge }).generate(INPUT).catch((caught: unknown) => caught);

  assert.ok(error instanceof QuizFailedError);
  assert.deepEqual(error.codeFailures, [
    "Item 1's explanation mentions an option id the item does not have.",
    "Item 2 gives two options the same id.",
  ]);
  assert.deepEqual(error.rounds[0]!.problems, error.codeFailures, "A round failed by the Code checks keeps them.");
  assert.equal(calls.length, 0);
});

test("An item marking two options correct, or a placeholder option, fails the Code checks", async () => {
  const draft = authored();
  draft.items[0]!.options[1]!.correct = true;
  draft.items[1]!.options[0]!.text = "option1";
  const { generator } = scriptedGenerator(draft);
  const { judge, calls } = scriptedJudge();
  const error = await createQuizGenerator({ generator, judge }).generate(INPUT).catch((caught: unknown) => caught);

  assert.ok(error instanceof QuizFailedError);
  assert.deepEqual(error.codeFailures, ["Item 1 needs exactly one correct option.", "Item 2 has a placeholder instead of an option."]);
  assert.equal(calls.length, 0);
});

test("A Judge failing twice is repaired twice", async () => {
  const overstated = { pass: false, failedChecks: ["explanation_support"], reasons: ["Item 5's explanation adds a detail the lessons do not state."] };
  const { generator, calls } = scriptedGenerator(authored());
  const { judge } = scriptedJudge(overstated, overstated, PASS);
  const { repairs, rounds } = await createQuizGenerator({ generator, judge }).generate(INPUT);

  assert.equal(repairs, 2);
  assert.equal(calls.length, 3);
  // Rejected drafts are saved nowhere else, so the passing Quiz carries them for its Pipeline Event (SEN-91).
  assert.deepEqual(rounds.map((round) => [round.modelId, round.problems]), [
    ["fixture/author", overstated.reasons], ["fixture/author", overstated.reasons], ["fixture/author", []],
  ]);
  assert.deepEqual(rounds.map((round) => round.items), [authored().items, authored().items, authored().items]);
});

test("A Quiz still failing after its two repairs throws with the last verdict and draft", async () => {
  const ambiguous = { pass: false, failedChecks: ["single_correct_answer"], reasons: ["Item 2 has two right options."] };
  const { generator, calls } = scriptedGenerator(authored());
  const { judge } = scriptedJudge(ambiguous);
  const error = await createQuizGenerator({ generator, judge }).generate(INPUT).catch((caught: unknown) => caught);

  assert.ok(error instanceof QuizFailedError);
  assert.equal(calls.length, 3, "One draft and two repairs.");
  assert.deepEqual(error.judge?.failedChecks, ["single_correct_answer"]);
  assert.equal(error.lesson?.body.items.length, 6);
  assert.deepEqual(error.rounds.map((round) => [round.modelId, round.problems]), [
    ["fixture/author", ambiguous.reasons], ["fixture/author", ambiguous.reasons], ["fixture/author", ambiguous.reasons],
  ]);
  assert.deepEqual(error.rounds[0]!.items, authored().items, "Each round keeps the items as written, option ids and all.");
});

test("A Quiz whose assessed Reading is not checkpointed fails its Code checks without a Judge call", async () => {
  const { generator } = scriptedGenerator(authored());
  const { judge, calls } = scriptedJudge();
  const error = await createQuizGenerator({ generator, judge }).generate({ ...INPUT, assessed: [] }).catch((caught: unknown) => caught);

  assert.ok(error instanceof QuizFailedError);
  assert.deepEqual(error.codeFailures, ["Assessed slot slot1 has no checkpointed Lesson."]);
  assert.equal(calls.length, 0);
});

test("The author may not judge its own Quiz", async () => {
  const { generator } = scriptedGenerator(authored());
  const { judge } = scriptedJudge();
  await assert.rejects(
    createQuizGenerator({ generator, judge: { ...judge, modelId: "fixture/author" } }).generate(INPUT),
    /Judge must use a different model/,
  );
});

test("When the author's repairs run out, the fallback author writes a fresh Quiz with its own repairs", async () => {
  const ambiguous = { pass: false, failedChecks: ["single_correct_answer"], reasons: ["Item 2 has two right options."] };
  const { generator, calls } = scriptedGenerator(authored());
  const fallback = scriptedGenerator(authored());
  const fallbackGenerator: Generator = {
    modelId: "fixture/fallback",
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      return { ...(await fallback.generator.generateStructured(request)), modelId: "fixture/fallback" };
    },
  };
  const { judge, calls: judgeCalls } = scriptedJudge(ambiguous, ambiguous, ambiguous, ambiguous, PASS);
  const checked = await createQuizGenerator({ generator, fallbackGenerator, judge }).generate(INPUT);

  assert.equal(calls.length, 3);
  assert.equal(fallback.calls.length, 2, "A fresh draft and one repair.");
  assert.equal((fallback.calls[0]!.input as { revision?: unknown }).revision, undefined, "The fallback does not repair the failed Quiz.");
  assert.deepEqual(judgeCalls.at(-1)!.authorModelIds, ["fixture/fallback"]);
  assert.deepEqual(checked.authorModelIds, ["fixture/fallback"]);
  assert.equal(checked.repairs, 1);
  assert.deepEqual(checked.rounds.map((round) => round.modelId),
    ["fixture/author", "fixture/author", "fixture/author", "fixture/fallback", "fixture/fallback"],
    "Rounds span both authors, so the event shows every model that wrote a draft.");
  assert.deepEqual(checked.rounds.map((round) => round.problems.length), [1, 1, 1, 1, 0]);

  const failing = scriptedJudge(ambiguous);
  await assert.rejects(
    createQuizGenerator({ generator, fallbackGenerator, judge: failing.judge }).generate(INPUT),
    (error: unknown) => error instanceof QuizFailedError && error.rounds.length === 6 && error.rounds.at(-1)!.modelId === "fixture/fallback",
  );
  assert.equal(failing.calls.length, 6, "Three Quizzes from each author, then the Course fails.");
});

const SCOPE = { inScope: ["the World Tree", "the Nine Worlds"], outOfScope: ["manuscript sources"] };

test("With a scope, it reaches the Quiz author and Judge with their scope rules; without one, inputs and prompts are as before", async () => {
  const scopedAuthor = scriptedGenerator(authored());
  const scopedJudge = scriptedJudge();
  await createQuizGenerator({ generator: scopedAuthor.generator, judge: scopedJudge.judge }).generate({ ...INPUT, scope: SCOPE });
  const plainAuthor = scriptedGenerator(authored());
  const plainJudge = scriptedJudge();
  await createQuizGenerator({ generator: plainAuthor.generator, judge: plainJudge.judge }).generate(INPUT);

  assert.deepEqual((scopedAuthor.calls[0]!.input as { scope: unknown }).scope, SCOPE);
  assert.deepEqual((scopedJudge.calls[0]!.input as { scope: unknown }).scope, SCOPE);
  assert.match(scopedAuthor.calls[0]!.systemPrompt, /Every item stays inside scope\.inScope; never test a facet in scope\.outOfScope\./);
  assert.match(scopedJudge.calls[0]!.systemPrompt, /An item that tests a facet in scope\.outOfScope tests nothing the Course teaches: fail answerable_from_lessons for it\./);
  for (const call of [scopedAuthor.calls[0]!, scopedJudge.calls[0]!]) assert.match(call.systemPrompt, /untrusted Learner content/);

  for (const call of [plainAuthor.calls[0]!, plainJudge.calls[0]!]) {
    assert.ok(!("scope" in (call.input as object)), "A null scope leaves the input as before.");
    assert.doesNotMatch(call.systemPrompt, /scope\.inScope|scope\.outOfScope/);
  }
  assert.ok(scopedAuthor.calls[0]!.systemPrompt.startsWith(`${plainAuthor.calls[0]!.systemPrompt}\n`));
  assert.ok(scopedJudge.calls[0]!.systemPrompt.startsWith(`${plainJudge.calls[0]!.systemPrompt}\n`));
});
