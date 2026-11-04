import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import type { BlueprintSlot, JudgeResult } from "@senoy/db/blueprint";
import type { MediaDescriptorFields, MediaLicense, VisualBrief } from "@senoy/db";
import type { MediaBlock, ProseBlock } from "@senoy/db/reading-lesson";
import { CATALOG_DIR } from "@senoy/media";
import type { PackSource, SourcePack } from "@senoy/research";
import { LeaseLostError } from "./generation-job.ts";
import type { Illustration, Illustrator } from "./illustrator.ts";
import type { Generator, Judge, StructuredRequest, ModelReply } from "./model-ports.ts";
import { rankCandidates, type MediaLibrary } from "./media-library.ts";
import { ModelError } from "./openrouter.ts";
import {
  applyRepairEdits, authoredSections, createReadingGenerator, LessonUnresearchableError, numberCitations, READING_JUDGE_CHECKS, ReadingFailedError,
  ReuseUnfitError, UNRELIABLE_SOURCE, lessonEvidence, MAX_REPAIRS, type ChapterInput, type CommonsFinder, type ReadingInput, type ReuseSeed,
} from "./reading-generation.ts";
import { ILLUSTRATION_RULE, READING_STYLE, TEACHING_VOICE } from "./teaching-style.ts";
import { createVisualJudge } from "./visual-judge.ts";

/** A Source with the given excerpts. */
function source(sourceId: string, url: string, excerpts: string[]): PackSource {
  return {
    sourceId, url, title: `Title of ${sourceId}`, host: new URL(url).host, preferred: false,
    retrievedAt: "2026-10-08T17:41:57.034Z", excerptOrigin: "vendor",
    excerpts: excerpts.map((text, index) => ({ id: `${sourceId}#${index + 1}`, text })),
  };
}

/** One Source pack. */
function pack(slot: "primary" | "secondary", sources: PackSource[]): SourcePack {
  return {
    slot, adapter: slot === "primary" ? "parallel-pro" : "you-research", topic: "Yggdrasil", status: "ok", error: null,
    startedAt: "2026-10-08T17:41:15.531Z", latencyMs: 1, estimatedCostUsd: 0.1, vendorRequestId: null,
    vendorSummary: "VENDOR SUMMARY", sources, filteredOut: [], warnings: [],
  };
}

const WIKI = source("src_aaaaaaaaaa", "https://en.wikipedia.org/w/index.php?oldid=1", ["Yggdrasil is the world tree."]);
const BRIT = source("src_bbbbbbbbbb", "https://www.britannica.com/topic/Yggdrasil", ["It has three roots."]);
const EMPTY = source("src_cccccccccc", "https://example.org/empty", []);

const SLOT: BlueprintSlot = {
  id: "slot1", method: "reading", title: "The World Tree", lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.",
  objectives: ["Describe Yggdrasil", "Name its roots"], topicTags: ["yggdrasil", "nine-worlds"], assessesSlotIds: [],
};

const INPUT: ReadingInput = {
  courseTitle: "Norse cosmology",
  learningGoal: "Explain the Norse picture of the world",
  scope: null,
  slot: SLOT,
  priorLessons: [],
  profile: { instructionLanguage: "en", contentScope: "compact" },
  // The same Wikipedia page from both engines, with a second excerpt, must stay one Source.
  packs: [pack("primary", [WIKI, EMPTY]), pack("secondary", [BRIT, source(WIKI.sourceId, WIKI.url, ["Its branches reach the heavens."])])],
};

/** Authored sections citing by Source ID. */
function authored(text = "Yggdrasil is the world tree [src_aaaaaaaaaa]. It has three roots [src_bbbbbbbbbb, src_aaaaaaaaaa].") {
  return { sections: [{ heading: "The tree", paragraphs: [text] }, { heading: "Roots", paragraphs: ["Roots again [src_bbbbbbbbbb]."] }] };
}

/** Repair edits as the author returns them. */
function edits(...pairs: [find: string, replace: string][]) {
  return { edits: pairs.map(([find, replace]) => ({ find, replace })) };
}

/** A repair edit that matches the default draft on every attempt and leaves it as it was. */
const TOUCH = edits(["Roots again", "Roots again"]);

/**
 * Scripted Generator: one output per call, repeating the last; records what it was shown and asked for. Word-list calls
 * are recorded apart in `glossaries` and answered with `terms`, empty unless a test fills it.
 */
function scriptedGenerator(output: unknown, modelId = "fixture/author", ...later: unknown[]) {
  const outputs = [output, ...later];
  const calls: { input: unknown; schemaName: string; systemPrompt: string; schema: unknown }[] = [];
  const glossaries: { input: unknown; systemPrompt: string }[] = [];
  const terms: { term: string; definition: string }[] = [];
  const generator: Generator = {
    modelId,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      if (request.schemaName === "reading_glossary") {
        glossaries.push({ input: request.input, systemPrompt: request.systemPrompt });
        return { value: request.parse({ terms }), modelId };
      }
      calls.push({ input: request.input, schemaName: request.schemaName, systemPrompt: request.systemPrompt, schema: request.schema });
      return { value: request.parse(outputs[Math.min(calls.length, outputs.length) - 1]), modelId: modelId };
    },
  };
  return { generator, calls, glossaries, terms };
}

const PASS = { pass: true, failedChecks: [], reasons: [] };

/** One objective's grounding verdict, as the grounding call returns it. */
type Grounded = { verdict: string; text?: string; reason?: string };

/**
 * Scripted Judge: one Lesson verdict per call, repeating the last; records what it was shown and who it was told wrote
 * it. Source vetting and objective grounding calls are recorded apart: vetting rejects the Source IDs in `rejected`,
 * and grounding supports every objective unless `grounded` holds another verdict for it. Word-list reviews are recorded
 * in `glossaryReviews` and reject the terms in `rejectedTerms`.
 */
function scriptedJudge(verdict: unknown = PASS, modelId = "fixture/judge", ...later: unknown[]) {
  const verdicts = [verdict, ...later];
  const calls: { input: unknown; authorModelIds: readonly string[]; schema: unknown; systemPrompt: string }[] = [];
  const vettings: { input: unknown; systemPrompt: string }[] = [];
  const groundings: { input: unknown; authorModelIds: readonly string[]; systemPrompt: string }[] = [];
  const rejected: string[] = [];
  const grounded = new Map<string, Grounded>();
  const glossaryReviews: { input: unknown; authorModelIds: readonly string[] }[] = [];
  const rejectedTerms: string[] = [];
  const judge: Judge = {
    modelId,
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
      if (request.schemaName === "reading_glossary_review") {
        glossaryReviews.push({ input: request.input, authorModelIds: request.authorModelIds });
        return { value: request.parse({ rejected: rejectedTerms.map((term) => ({ term, reason: "Says more than the excerpts." })) }), modelId };
      }
      if (request.schemaName === "source_vetting") {
        vettings.push({ input: request.input, systemPrompt: request.systemPrompt });
        return { value: request.parse({ rejected: rejected.map((sourceId) => ({ sourceId, reason: "A shop's blog." })) }), modelId: modelId };
      }
      if (request.schemaName === "objective_grounding") {
        groundings.push({ input: request.input, authorModelIds: request.authorModelIds, systemPrompt: request.systemPrompt });
        const { objectives } = (request.input as { slot: { objectives: string[] } }).slot;
        return {
          value: request.parse({
            objectives: objectives.map((objective) => ({
              objective, verdict: "supported", text: "", reason: "", ...grounded.get(objective),
            })),
          }),
          modelId: modelId,
        };
      }
      calls.push({ input: request.input, authorModelIds: request.authorModelIds, schema: request.schema, systemPrompt: request.systemPrompt });
      return { value: request.parse(verdicts[Math.min(calls.length, verdicts.length) - 1]), modelId: modelId };
    },
  };
  return { judge, calls, vettings, groundings, rejected, grounded, glossaryReviews, rejectedTerms };
}

test("A cited reading becomes numbered Citations in order of first use, with the source list behind them", async () => {
  const { generator } = scriptedGenerator(authored());
  const { judge, calls } = scriptedJudge();
  const { lesson, judge: verdict, repairs } = await createReadingGenerator({ generator, judge }).generate(INPUT);

  assert.equal(verdict.pass, true);
  assert.equal(repairs, 0);
  assert.equal(lesson.teachingMethod, "reading");
  assert.equal(lesson.title, SLOT.title);
  assert.deepEqual(lesson.objectives, SLOT.objectives);
  assert.equal(lesson.lineage, null);
  assert.equal((lesson.body.sections[0]!.blocks[0]! as ProseBlock).text, "Yggdrasil is the world tree [1]. It has three roots [2][1].");
  assert.equal((lesson.body.sections[1]!.blocks[0]! as ProseBlock).text, "Roots again [2].");
  assert.deepEqual(lesson.citations, [
    { n: 1, title: WIKI.title, url: WIKI.url },
    { n: 2, title: BRIT.title, url: BRIT.url },
  ]);
  assert.deepEqual(lesson.sources.map(({ n, sourceId, publisher, usedAs }) => ({ n, sourceId, publisher, usedAs })), [
    { n: 1, sourceId: WIKI.sourceId, publisher: "en.wikipedia.org", usedAs: "paraphrase" },
    { n: 2, sourceId: BRIT.sourceId, publisher: "www.britannica.com", usedAs: "paraphrase" },
  ]);
  assert.deepEqual(calls[0]!.authorModelIds, ["fixture/author"]);
});

test("The author sees each Source once with every excerpt, and never a vendor summary or an excerpt-less Source", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge, calls: judgeCalls } = scriptedJudge();
  await createReadingGenerator({ generator, judge }).generate(INPUT);

  const told = calls[0]!.input as { sources: { sourceId: string; excerpts: string[] }[]; profile: unknown };
  assert.deepEqual(told.sources.map((s) => s.sourceId), [WIKI.sourceId, BRIT.sourceId]);
  assert.deepEqual(told.sources[0]!.excerpts, ["Yggdrasil is the world tree.", "Its branches reach the heavens."]);
  // Reliability is judged per Source, so both roles see where each one lives.
  assert.deepEqual(told.sources[1], { sourceId: BRIT.sourceId, title: BRIT.title, url: BRIT.url, host: "www.britannica.com", preferred: false, excerpts: ["It has three roots."] });
  assert.deepEqual(told.profile, INPUT.profile);
  assert.ok(!JSON.stringify(calls[0]!.input).includes("VENDOR SUMMARY"));

  const shown = judgeCalls[0]!.input as { sources: { n: number; url: string; preferred: boolean; excerpts: string[] }[] };
  assert.deepEqual(shown.sources.map((s) => [s.n, s.url, s.preferred]), [[1, WIKI.url, false], [2, BRIT.url, false]]);
  assert.deepEqual(shown.sources[1]!.excerpts, ["It has three roots."]);
});

const UNSUPPORTED = { pass: false, failedChecks: ["claim_support"], reasons: ["[2] does not say the roots are three."] };

test("A Judge failure is repaired by edits: the repair sees its draft, the numbering, and the reasons, and nothing else changes", async () => {
  const cut = edits(["It has three roots [src_bbbbbbbbbb, src_aaaaaaaaaa].", ""]);
  const { generator, calls } = scriptedGenerator(authored(), "fixture/author", cut);
  const { judge, calls: judgeCalls } = scriptedJudge(UNSUPPORTED, "fixture/judge", PASS);
  const { lesson, repairs } = await createReadingGenerator({ generator, judge }).generate(INPUT);

  assert.equal(repairs, 1);
  assert.equal(judgeCalls.length, 2);
  assert.deepEqual(calls.map((call) => call.schemaName), ["cited_reading", "cited_reading_repair"], "A repair returns edits, never a new Lesson.");
  assert.equal((lesson.body.sections[0]!.blocks[0]! as ProseBlock).text, "Yggdrasil is the world tree [1].");
  assert.equal((lesson.body.sections[1]!.blocks[0]! as ProseBlock).text, "Roots again [2].", "The passage no problem named is kept verbatim.");
  assert.equal((calls[0]!.input as { previousDraft?: unknown }).previousDraft, undefined);
  const revision = calls[1]!.input as { previousDraft: unknown; numberedSources: unknown; problems: string[]; sources: unknown[] };
  assert.deepEqual(revision.previousDraft, authored().sections);
  assert.deepEqual(revision.numberedSources, [{ n: 1, sourceId: WIKI.sourceId }, { n: 2, sourceId: BRIT.sourceId }]);
  assert.deepEqual(revision.problems, UNSUPPORTED.reasons);
  assert.equal(revision.sources.length, 2, "A repair is grounded in the same Sources.");
});

test("The author writes to the style guide, a repair keeps its voice, and the Judge accepts the illustrations it allows", async () => {
  const { generator, calls } = scriptedGenerator(authored(), "fixture/author", TOUCH);
  const { judge, calls: judgeCalls } = scriptedJudge(UNSUPPORTED, "fixture/judge", PASS);
  await createReadingGenerator({ generator, judge }).generate(INPUT);

  assert.ok(calls[0]!.systemPrompt.includes(READING_STYLE));
  assert.ok(calls[1]!.systemPrompt.includes(TEACHING_VOICE), "A replacement sentence reads like the rest of the draft.");
  // The author and the Judge get one wording of when an analogy is not a claim, so they decide it the same way.
  for (const prompt of [calls[0]!.systemPrompt, calls[1]!.systemPrompt, judgeCalls[0]!.systemPrompt]) assert.ok(prompt.includes(ILLUSTRATION_RULE));
  for (const prompt of [READING_STYLE, ILLUSTRATION_RULE]) assert.doesNotMatch(prompt, /norse|yggdrasil/i, "Prompts stay subject-neutral (ADR 0011).");
});

test("A repair whose edits all miss is not judged again; the next repair gets the same problems and is told why", async () => {
  const miss = edits(["A sentence the draft never had.", "Anything."]);
  const { generator, calls } = scriptedGenerator(authored(), "fixture/author", miss, TOUCH);
  const { judge, calls: judgeCalls } = scriptedJudge(UNSUPPORTED, "fixture/judge", PASS);
  const { repairs } = await createReadingGenerator({ generator, judge }).generate(INPUT);

  assert.equal(repairs, 2);
  assert.equal(judgeCalls.length, 2, "The unchanged draft was not sent to the Judge.");
  const problems = (calls[2]!.input as { problems: string[] }).problems;
  assert.match(problems[0]!, /None of your edits changed previousDraft/);
  assert.deepEqual(problems.slice(1), UNSUPPORTED.reasons);
});

test("The next repair is told which of the last repair's edits matched nothing", async () => {
  const partly = edits(["Roots again", "Roots again"], ["A sentence the draft never had.", "Anything."]);
  const { generator, calls } = scriptedGenerator(authored(), "fixture/author", partly);
  const { judge } = scriptedJudge(UNSUPPORTED, "fixture/judge", UNSUPPORTED, PASS);
  await createReadingGenerator({ generator, judge }).generate(INPUT);
  const problems = (calls[2]!.input as { problems: string[] }).problems;
  assert.deepEqual(problems.slice(0, -1), UNSUPPORTED.reasons);
  assert.match(problems.at(-1)!, /not applied.*"A sentence the draft never had\."/);
});

test("A last repair that misses fails with the last real verdict", async () => {
  const miss = edits(["A sentence the draft never had.", "Anything."]);
  const { generator } = scriptedGenerator(authored(), "fixture/author", miss);
  const { judge } = scriptedJudge(UNSUPPORTED);
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), (error: unknown) =>
    error instanceof ReadingFailedError && error.judge?.reasons.join() === UNSUPPORTED.reasons.join());
});

test("Repair edits change only the one passage each names, and skip a passage that is missing or ambiguous", () => {
  const draft = [
    { heading: "A", paragraphs: ["One  two [src_aaaaaaaaaa]. Three.", "Three."] },
    { heading: "B", paragraphs: ["Gone entirely."] },
  ];
  const { sections, applied, skipped } = applyRepairEdits(draft, [
    { find: "One two [src_aaaaaaaaaa].", replace: "One costs $1 [src_aaaaaaaaaa]." },
    { find: "Three.", replace: "Ambiguous: it is in two paragraphs." },
    { find: "Not in the draft.", replace: "x" },
    { find: "Gone entirely.", replace: "" },
  ]);
  assert.equal(applied, 2);
  assert.deepEqual(skipped, ["Three.", "Not in the draft."]);
  assert.deepEqual(sections, [{ heading: "A", paragraphs: ["One costs $1 [src_aaaaaaaaaa]. Three.", "Three."] }],
    "Spacing is forgiven, $ is literal, an emptied section is dropped, and the rest is verbatim.");
  assert.deepEqual(draft[1]!.paragraphs, ["Gone entirely."], "The previous draft is not mutated.");
});

test("A Citation to a Source ID outside the packs fails the Code checks, is repaired, and never reaches the Judge", async () => {
  const { generator, calls } = scriptedGenerator(authored("Yggdrasil is the world tree [src_aaaaaaaaaa, src_dddddddddd]."), "fixture/author", TOUCH);
  const { judge, calls: judgeCalls } = scriptedJudge();
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), (error: unknown) =>
    error instanceof ReadingFailedError && error.codeFailures.some((failure) => failure.includes("Source ID")) && error.lesson !== null);
  assert.equal(calls.length, 3, "One initial attempt and two repairs (spec §6.1).");
  assert.ok((calls[1]!.input as { problems: string[] }).problems.some((problem) => problem.includes("Source ID")));
  assert.equal(judgeCalls.length, 0);
});

test("A Lesson the Judge still fails after its two repairs fails, whatever pass says", async () => {
  const { generator, calls } = scriptedGenerator(authored(), "fixture/author", TOUCH);
  const { judge } = scriptedJudge({ pass: true, failedChecks: ["claim_support", "claim_support"], reasons: ["Unsupported root count."] });
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), (error: unknown) =>
    error instanceof ReadingFailedError && error.codeFailures.length === 0 && error.judge?.failedChecks.join() === "claim_support");
  assert.equal(calls.length, 3);
});

test("Sources the Judge model vets out never reach the author; preferred hosts are never vetted", async () => {
  const { generator, calls } = scriptedGenerator({ sections: [{ heading: "The tree", paragraphs: ["Yggdrasil is the world tree [src_aaaaaaaaaa]."] }] });
  const { judge, vettings, rejected } = scriptedJudge();
  rejected.push(BRIT.sourceId);
  const packs = [pack("primary", [{ ...WIKI, preferred: true }, BRIT])];
  const { rejectedSources } = await createReadingGenerator({ generator, judge }).generate({ ...INPUT, packs });

  assert.deepEqual(rejectedSources, [{ sourceId: BRIT.sourceId, url: BRIT.url, reason: "A shop's blog." }]);
  const vetted = vettings[0]!.input as { pages: { sourceId: string }[] };
  assert.deepEqual(vetted.pages.map((page) => page.sourceId), [BRIT.sourceId], "The preferred Wikipedia page is not vetted.");
  const told = calls[0]!.input as { sources: { sourceId: string }[] };
  assert.deepEqual(told.sources.map((s) => s.sourceId), [WIKI.sourceId]);
});

test("Citing a vetted-out Source is a Citation to an unknown Source", async () => {
  const { generator } = scriptedGenerator(authored(), "fixture/author", TOUCH);
  const { judge, rejected } = scriptedJudge();
  rejected.push(BRIT.sourceId);
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), (error: unknown) =>
    error instanceof ReadingFailedError && error.codeFailures.some((failure) => failure.includes("Source ID")) &&
    error.rejectedSources.length === 1);
});

test("Whether a Source is fit to cite is decided once, by vetting; the Lesson Judge never asks again", async () => {
  const { generator } = scriptedGenerator(authored());
  const { judge, calls, vettings } = scriptedJudge();
  await createReadingGenerator({ generator, judge }).generate(INPUT);
  assert.ok(vettings[0]!.systemPrompt.includes(UNRELIABLE_SOURCE));
  assert.ok(!(READING_JUDGE_CHECKS as readonly string[]).includes("unreliable_source"));
  const schema = calls[0]!.schema as { properties: { failedChecks: { items: { enum: readonly string[] } } } };
  assert.deepEqual(schema.properties.failedChecks.items.enum, READING_JUDGE_CHECKS);
});

test("Packs with no excerpts are unresearchable, before any model call", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge } = scriptedJudge();
  await assert.rejects(createReadingGenerator({ generator, judge }).generate({ ...INPUT, packs: [pack("primary", [EMPTY])] }),
    (error: unknown) => error instanceof LessonUnresearchableError && error.slotId === INPUT.slot.id);
  assert.equal(calls.length, 0);
});

test("An objective the excerpts cannot support is rewritten to what they do, before a word is written (ADR 0022)", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge, calls: judgeCalls, groundings, grounded } = scriptedJudge();
  grounded.set("Name its roots", { verdict: "rewritten", text: "Say that it has roots", reason: "No excerpt gives a number of roots." });
  const { lesson, grounding } = await createReadingGenerator({ generator, judge }).generate(INPUT);

  // Grounding runs on the vetted Sources, so the author is never asked for a claim its evidence cannot carry.
  assert.deepEqual((groundings[0]!.input as { sources: { sourceId: string }[] }).sources.map((s) => s.sourceId), [WIKI.sourceId, BRIT.sourceId]);
  const taught = ["Describe Yggdrasil", "Say that it has roots"];
  assert.deepEqual((calls[0]!.input as { slot: { objectives: string[] } }).slot.objectives, taught);
  assert.deepEqual((judgeCalls[0]!.input as { slot: { objectives: string[] } }).slot.objectives, taught,
    "The Judge checks coverage of what the Sources allow, not of the Blueprint's wording.");
  assert.deepEqual(lesson.objectives, taught, "The checkpoint records what the Lesson taught.");
  assert.deepEqual(grounding.map(({ objective, verdict }) => [objective, verdict]), [
    ["Describe Yggdrasil", "supported"], ["Name its roots", "rewritten"],
  ], "Grounding keeps the approved Blueprint's wording beside each verdict.");
});

test("An objective nothing supports is dropped, so teaching it cannot fail against leaving it out", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge, calls: judgeCalls, grounded } = scriptedJudge();
  grounded.set("Name its roots", { verdict: "unsupported", reason: "No excerpt mentions a root." });
  const { lesson } = await createReadingGenerator({ generator, judge }).generate(INPUT);

  assert.deepEqual(lesson.objectives, ["Describe Yggdrasil"]);
  assert.deepEqual((calls[0]!.input as { slot: { objectives: string[] } }).slot.objectives, ["Describe Yggdrasil"]);
  assert.deepEqual((judgeCalls[0]!.input as { slot: { objectives: string[] } }).slot.objectives, ["Describe Yggdrasil"]);
});

test("Sources that support no objective ground nothing: unresearchable, before any draft is written", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge, grounded } = scriptedJudge();
  for (const objective of SLOT.objectives) grounded.set(objective, { verdict: "unsupported", reason: "Nothing covers it." });
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT),
    (error: unknown) => error instanceof LessonUnresearchableError && error.slotId === SLOT.id);
  assert.equal(calls.length, 0, "Retry searches again rather than rewriting the same draft.");
});

test("The Judge is told not to fail coverage of an objective the excerpts cannot support", async () => {
  const { generator } = scriptedGenerator(authored());
  const { judge, calls } = scriptedJudge();
  await createReadingGenerator({ generator, judge }).generate(INPUT);
  // The author is told to teach what the excerpts support and say no more; a Judge that failed it for that would
  // leave no passing draft at all (ADR 0022).
  assert.match(calls[0]!.systemPrompt, /objective_coverage: .* an objective they cannot support is not a failure/);
});

test("Vetting out every Source is unresearchable, and says which were vetted out", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge, rejected } = scriptedJudge();
  rejected.push(BRIT.sourceId);
  await assert.rejects(createReadingGenerator({ generator, judge }).generate({ ...INPUT, packs: [pack("primary", [BRIT])] }),
    (error: unknown) => error instanceof LessonUnresearchableError && error.rejectedSources.length === 1);
  assert.equal(calls.length, 0);
});

test("A repair written by the fallback model is judged by a model that wrote neither draft", async () => {
  const { generator } = scriptedGenerator(authored(), "fixture/author", TOUCH);
  const authoredBy = ["fixture/author", "fixture/fallback"];
  const write = generator.generateStructured.bind(generator);
  generator.generateStructured = async (request) => ({ ...(await write(request)), modelId: authoredBy.shift() ?? "fixture/fallback" });
  const { judge, calls } = scriptedJudge(UNSUPPORTED, "fixture/judge", PASS);
  const checked = await createReadingGenerator({ generator, judge }).generate(INPUT);
  assert.deepEqual(calls.map((call) => call.authorModelIds), [["fixture/author"], ["fixture/author", "fixture/fallback"]]);
  assert.deepEqual(checked.authorModelIds, ["fixture/author", "fixture/fallback"]);
  assert.equal(checked.judgeModelId, "fixture/judge");
});

test("The author never judges its own Lesson", async () => {
  const { generator, calls } = scriptedGenerator(authored(), "same/model");
  const { judge } = scriptedJudge(undefined, "same/model");
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), /different model/);
  assert.equal(calls.length, 0);
});

test("A failed Reading carries every round: the first draft's text, each repair's edits, and what failed each", async () => {
  const miss = edits(["A sentence the draft never had.", "Anything."]);
  const { generator } = scriptedGenerator(authored(), "fixture/author", TOUCH, miss);
  const { judge } = scriptedJudge(UNSUPPORTED);
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), (error: unknown) => {
    assert.ok(error instanceof ReadingFailedError);
    assert.deepEqual(error.rounds.map((round) => round.modelId), ["fixture/author", "fixture/author", "fixture/author"]);
    assert.deepEqual(error.rounds[0]!.draft, authored().sections);
    assert.deepEqual(error.rounds[1]!.edits, TOUCH.edits);
    assert.deepEqual(error.rounds[2]!.skipped, ["A sentence the draft never had."]);
    assert.deepEqual(error.rounds.map((round) => round.problems[0]), [UNSUPPORTED.reasons[0], UNSUPPORTED.reasons[0], error.rounds[2]!.problems[0]]);
    assert.match(error.rounds[2]!.problems[0]!, /None of your edits changed previousDraft/);
    return true;
  });
});

test("When the author's repairs run out, the fallback author writes a fresh draft from the same Sources", async () => {
  const { generator } = scriptedGenerator(authored(), "fixture/author", TOUCH);
  const { generator: fallbackGenerator, calls: fallbackCalls } = scriptedGenerator(authored("Yggdrasil is the world tree [src_aaaaaaaaaa]."), "fixture/fallback");
  const { judge, calls: judgeCalls } = scriptedJudge(UNSUPPORTED, "fixture/judge", UNSUPPORTED, UNSUPPORTED, PASS);
  const checked = await createReadingGenerator({ generator, fallbackGenerator, judge }).generate(INPUT);

  assert.deepEqual(fallbackCalls.map((call) => call.schemaName), ["cited_reading"], "A fresh draft, not a repair of the failed one.");
  assert.equal((fallbackCalls[0]!.input as { previousDraft?: unknown }).previousDraft, undefined);
  assert.equal((fallbackCalls[0]!.input as { sources: unknown[] }).sources.length, 2);
  assert.deepEqual(judgeCalls.at(-1)!.authorModelIds, ["fixture/fallback"], "The failed drafts are not part of this Lesson.");
  assert.deepEqual(checked.authorModelIds, ["fixture/fallback"]);
  assert.equal(checked.repairs, 0);
  assert.deepEqual(checked.rounds.map((round) => [round.modelId, round.problems.length]),
    [["fixture/author", 1], ["fixture/author", 1], ["fixture/author", 1], ["fixture/fallback", 0]]);
});

test("The fallback author gets its own repairs, and its failure carries both authors' rounds", async () => {
  const { generator } = scriptedGenerator(authored(), "fixture/author", TOUCH);
  const { generator: fallbackGenerator, calls: fallbackCalls } = scriptedGenerator(authored(), "fixture/fallback", TOUCH);
  const { judge } = scriptedJudge(UNSUPPORTED);
  await assert.rejects(createReadingGenerator({ generator, fallbackGenerator, judge }).generate(INPUT), (error: unknown) =>
    error instanceof ReadingFailedError && error.rounds.length === 6 && error.rounds.at(-1)!.modelId === "fixture/fallback");
  assert.deepEqual(fallbackCalls.map((call) => call.schemaName), ["cited_reading", "cited_reading_repair", "cited_reading_repair"]);
});

test("A fallback that is the author's own model is not a second author", async () => {
  const { generator, calls } = scriptedGenerator(authored(), "fixture/author", TOUCH);
  const { generator: fallbackGenerator, calls: fallbackCalls } = scriptedGenerator(authored(), "fixture/author");
  const { judge } = scriptedJudge(UNSUPPORTED);
  await assert.rejects(createReadingGenerator({ generator, fallbackGenerator, judge }).generate(INPUT), ReadingFailedError);
  assert.equal(calls.length, 3);
  assert.equal(fallbackCalls.length, 0);
});

// The Pacific Course (SEN-105): true, cited, and beside the point, so only the Judge's off_goal check can catch it.
const OCEAN = source("src_1111111111", "https://en.wikipedia.org/wiki/Pacific_Ocean", ["The Pacific is the largest and deepest ocean.", "It covers about a third of Earth's surface."]);
const TRENCH = source("src_2222222222", "https://www.britannica.com/place/Mariana-Trench", ["The Mariana Trench is the deepest known point in the ocean."]);
const FISHERY = source("src_3333333333", "https://www.fao.org/fishery/pacific", ["Small-scale fishermen in parts of the western Pacific depend on reef fish.", "The humphead wrasse is listed as endangered."]);

const PACIFIC: ReadingInput = {
  courseTitle: "The Pacific Ocean",
  learningGoal: "Explain the Pacific Ocean's size, depth, and shape",
  scope: null,
  slot: {
    id: "slot1", method: "reading", title: "How big and deep the Pacific is", lessonGoal: "Describe the Pacific's size and depth.",
    objectives: ["Describe the Pacific's size", "Name its deepest point"], topicTags: ["pacific", "ocean-depth"], assessesSlotIds: [],
  },
  priorLessons: [],
  profile: { instructionLanguage: "en", contentScope: "compact" },
  packs: [pack("primary", [OCEAN, FISHERY]), pack("secondary", [TRENCH])],
};

/** A Pacific draft whose middle section is a true, cited tangent on fishermen and one endangered fish. */
const PACIFIC_DRAFT = {
  sections: [
    { heading: "The largest ocean", paragraphs: ["The Pacific is the largest and deepest ocean [src_1111111111]. It covers about a third of Earth's surface [src_1111111111]."] },
    {
      heading: "Fishing communities",
      paragraphs: [
        "Small-scale fishermen in parts of the western Pacific depend on reef fish [src_3333333333].",
        "One of those fish, the humphead wrasse, is listed as endangered [src_3333333333].",
      ],
    },
    { heading: "The deepest point", paragraphs: ["The Mariana Trench is the deepest known point in the ocean [src_2222222222]."] },
  ],
};

const OFF_GOAL = {
  pass: false,
  failedChecks: ["off_goal"],
  reasons: ["The section \"Fishing communities\" (\"Small-scale fishermen in parts of the western Pacific…\") serves no objective: it is about fishing and one endangered fish, not the ocean's size or depth."],
};

test("A section the Judge fails as off_goal is cut by the repair, its Source drops out of the list, and the Reading passes", async () => {
  const cut = edits(
    ["Small-scale fishermen in parts of the western Pacific depend on reef fish [src_3333333333].", ""],
    ["One of those fish, the humphead wrasse, is listed as endangered [src_3333333333].", ""],
  );
  const { generator, calls } = scriptedGenerator(PACIFIC_DRAFT, "fixture/author", cut);
  const { judge, calls: judgeCalls } = scriptedJudge(OFF_GOAL, "fixture/judge", PASS);
  const { lesson, repairs, rounds } = await createReadingGenerator({ generator, judge }).generate(PACIFIC);

  assert.equal(repairs, 1);
  assert.deepEqual(calls.map((call) => call.schemaName), ["cited_reading", "cited_reading_repair"]);
  const revision = calls[1]!.input as { problems: string[]; numberedSources: { n: number; sourceId: string }[] };
  assert.deepEqual(revision.problems, OFF_GOAL.reasons, "The repair is told which section serves no objective.");
  assert.match(calls[1]!.systemPrompt, /To fix an off_goal passage, one that serves no objective, cut it/);
  assert.deepEqual(rounds[0]!.problems, OFF_GOAL.reasons);

  assert.deepEqual(lesson.body.sections.map((section) => section.heading), ["The largest ocean", "The deepest point"], "The emptied section is gone, heading and all.");
  assert.equal((lesson.body.sections[1]!.blocks[0]! as ProseBlock).text, "The Mariana Trench is the deepest known point in the ocean [2].");
  assert.deepEqual(lesson.sources.map(({ n, sourceId }) => ({ n, sourceId })), [{ n: 1, sourceId: OCEAN.sourceId }, { n: 2, sourceId: TRENCH.sourceId }],
    "Citations are renumbered and the Source only the cut section cited is no longer listed.");
  assert.deepEqual(lesson.citations.map(({ n, url }) => [n, url]), [[1, OCEAN.url], [2, TRENCH.url]]);
  const judged = judgeCalls[1]!.input as { lesson: { sections: { heading: string }[] }; sources: { url: string }[] };
  assert.ok(!judged.lesson.sections.some((section) => section.heading === "Fishing communities"));
  assert.ok(!judged.sources.some((s) => s.url === FISHERY.url));
});

test("The Judge may fail off_goal, judges it against the Course goal, and allows short context that serves an objective", async () => {
  const { generator, calls } = scriptedGenerator(PACIFIC_DRAFT);
  const { judge, calls: judgeCalls } = scriptedJudge();
  await createReadingGenerator({ generator, judge }).generate(PACIFIC);

  assert.ok((READING_JUDGE_CHECKS as readonly string[]).includes("off_goal"));
  const schema = judgeCalls[0]!.schema as { properties: { failedChecks: { items: { enum: readonly string[] } } } };
  assert.ok(schema.properties.failedChecks.items.enum.includes("off_goal"));
  const prompt = judgeCalls[0]!.systemPrompt;
  assert.match(prompt, /- off_goal: a section, or a stretch of a paragraph or more, serves no objective/);
  assert.match(prompt, /A sentence or two of context that serves an objective, such as why it matters or a short example, is fine\./);
  assert.match(prompt, /Name the section by its heading and quote the stretch's opening words/);
  assert.equal((judgeCalls[0]!.input as { learningGoal: string }).learningGoal, PACIFIC.learningGoal);
  assert.match(calls[0]!.systemPrompt, /Sources are evidence, not an outline: never include a fact because a Source has it\. Every section serves an objective/);
  for (const text of [calls[0]!.systemPrompt, prompt]) assert.doesNotMatch(text, /pacific|ocean|fish|wrasse/i, "Prompts stay subject-neutral (ADR 0011).");
});

test("A cut that leaves only a Source ID marker drops the paragraph, and an untouched paragraph stays as it is", () => {
  const { sections } = applyRepairEdits([
    { heading: "A", paragraphs: ["Kept [src_aaaaaaaaaa].", "Cut this [src_aaaaaaaaaa]."] },
    { heading: "B", paragraphs: ["Only words."] },
  ], [{ find: "Cut this", replace: "" }]);
  assert.deepEqual(sections, [{ heading: "A", paragraphs: ["Kept [src_aaaaaaaaaa]."] }, { heading: "B", paragraphs: ["Only words."] }]);
});

const PACIFIC_SCOPE = { inScope: ["size and depth", "ocean floor features"], outOfScope: ["fisheries", "marine species"] };

test("With a scope, it reaches the author, repair, and Judge inputs and each prompt gets its scope rule", async () => {
  const { generator, calls } = scriptedGenerator(PACIFIC_DRAFT, "fixture/author", edits(["One of those fish, the humphead wrasse, is listed as endangered [src_3333333333].", ""]));
  const { judge, calls: judgeCalls } = scriptedJudge(OFF_GOAL, "fixture/judge", PASS);
  await createReadingGenerator({ generator, judge }).generate({ ...PACIFIC, scope: PACIFIC_SCOPE });

  for (const call of [...calls, ...judgeCalls]) assert.deepEqual((call.input as { scope: unknown }).scope, PACIFIC_SCOPE);
  for (const call of calls) assert.match(call.systemPrompt, /Stay inside scope\.inScope; never teach a facet in scope\.outOfScope, even where a Source covers it\./);
  assert.match(judgeCalls[0]!.systemPrompt, /A passage that teaches a facet in scope\.outOfScope also fails off_goal\./);
  for (const call of [...calls, ...judgeCalls]) assert.match(call.systemPrompt, /untrusted Learner content/);

  // The same Reading without a scope: no scope key anywhere, and each prompt is the scoped one without its rule.
  const unscoped = scriptedGenerator(PACIFIC_DRAFT, "fixture/author", edits(["One of those fish, the humphead wrasse, is listed as endangered [src_3333333333].", ""]));
  const unscopedJudge = scriptedJudge(OFF_GOAL, "fixture/judge", PASS);
  await createReadingGenerator({ generator: unscoped.generator, judge: unscopedJudge.judge }).generate(PACIFIC);
  for (const call of [...unscoped.calls, ...unscopedJudge.calls]) {
    assert.ok(!("scope" in (call.input as object)), "A null scope leaves the input as before.");
    assert.doesNotMatch(call.systemPrompt, /scope\.inScope|scope\.outOfScope/);
  }
  calls.forEach((call, index) => assert.ok(call.systemPrompt.startsWith(`${unscoped.calls[index]!.systemPrompt}\n`)));
  assert.ok(judgeCalls[0]!.systemPrompt.startsWith(`${unscopedJudge.calls[0]!.systemPrompt}\n`));
});

/** A published Reading fitted to SLOT, written for exactly this Learner's write-time values, citing by Source ID. */
const SEED: ReuseSeed = {
  originLessonId: "origin-lesson",
  title: "Yggdrasil",
  lessonGoal: "Describe the world tree.",
  objectives: ["Describe Yggdrasil", "Name its roots"],
  sections: authored().sections,
  writtenFor: { instructionLanguage: "en", requiredReadingSupports: [], contentScope: "compact", explanationOrder: "topic_appropriate" },
  verbatimAllowed: true,
  authorModelIds: ["origin/author"],
  rejectedSources: [],
};

/** INPUT with a reused Lesson to fit. */
function reusing(seed: Partial<ReuseSeed> = {}): ReadingInput {
  return { ...INPUT, reuse: { ...SEED, ...seed } };
}

/** What the fit pass returns. */
function fitReply(decision: "verbatim" | "adapt" | "generate", sections: unknown[] = []) {
  return { decision, reason: `Chose ${decision}.`, sections };
}

test("A reused Lesson taken verbatim is its own body, judged against its own packs as any draft is, and records verbatim lineage", async () => {
  const { generator, calls } = scriptedGenerator(fitReply("verbatim"));
  const { judge, calls: judgeCalls, vettings, groundings } = scriptedJudge();
  const checked = await createReadingGenerator({ generator, judge }).generate(reusing());

  assert.deepEqual(calls.map((call) => call.schemaName), ["reading_reuse_fit"], "Nothing is written from scratch.");
  assert.equal(vettings.length, 0, "Its packs keep the vetting verdicts they were written with.");
  assert.equal(groundings.length, 1, "Its objectives are still grounded against its Sources.");
  assert.equal(judgeCalls.length, 1, "Verbatim is not a skip card: the reading Judge still runs.");
  assert.deepEqual(judgeCalls[0]!.authorModelIds, ["origin/author"], "The model that chose verbatim wrote nothing.");
  assert.deepEqual(checked.lesson.lineage, { originLessonId: "origin-lesson", mode: "verbatim" });
  assert.equal(checked.lesson.title, SLOT.title, "The approved slot's title and goal always win.");
  assert.equal(checked.lesson.lessonGoal, SLOT.lessonGoal);
  assert.equal((checked.lesson.body.sections[0]!.blocks[0]! as ProseBlock).text, "Yggdrasil is the world tree [1]. It has three roots [2][1].");
  assert.deepEqual(checked.authorModelIds, ["origin/author"]);
  assert.deepEqual(checked.rounds[0]!.reuse, { decision: "verbatim", reason: "Chose verbatim." });

  const fitInput = calls[0]!.input as { candidate: { writtenFor: unknown; sections: unknown }; slot: { objectives: string[] }; sources: unknown[] };
  assert.deepEqual(fitInput.candidate.sections, SEED.sections);
  assert.deepEqual(fitInput.candidate.writtenFor, SEED.writtenFor);
  assert.deepEqual(fitInput.slot.objectives, SLOT.objectives);
  assert.equal(fitInput.sources.length, 2);
});

test("An adapted reused Lesson is the fit pass's sections, and the fitting model becomes one of its authors", async () => {
  const adapted = authored("Yggdrasil is the world tree [src_aaaaaaaaaa]. Its roots are three [src_bbbbbbbbbb].").sections;
  const { generator } = scriptedGenerator(fitReply("adapt", adapted));
  const { judge, calls: judgeCalls } = scriptedJudge();
  const checked = await createReadingGenerator({ generator, judge }).generate(reusing());

  assert.deepEqual(checked.lesson.lineage, { originLessonId: "origin-lesson", mode: "adapted" });
  assert.equal((checked.lesson.body.sections[0]!.blocks[0]! as ProseBlock).text, "Yggdrasil is the world tree [1]. Its roots are three [2].");
  assert.deepEqual(judgeCalls[0]!.authorModelIds, ["origin/author", "fixture/author"]);
  assert.deepEqual(checked.authorModelIds, ["origin/author", "fixture/author"]);
});

test("Verbatim is not offered for a Lesson written for another profile, and choosing it anyway is invalid output", async () => {
  const { generator, calls } = scriptedGenerator(fitReply("verbatim"));
  const { judge } = scriptedJudge();
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(reusing({ verbatimAllowed: false })), ModelError);
  assert.equal(calls.length, 1);
});

test("A reused Lesson the fit pass cannot honestly adapt is unfit, and nothing is judged", async () => {
  const { generator } = scriptedGenerator(fitReply("generate"));
  const { judge, calls: judgeCalls } = scriptedJudge();
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(reusing()), (error: unknown) =>
    error instanceof ReuseUnfitError && error.slotId === "slot1" && error.reason === "Chose generate." &&
    error.rounds[0]!.reuse!.decision === "generate");
  assert.equal(judgeCalls.length, 0);
});

test("A reused Lesson whose Sources cannot support an objective at all is unfit before the fit pass runs", async () => {
  const { generator, calls } = scriptedGenerator(fitReply("verbatim"));
  const { judge, grounded } = scriptedJudge();
  grounded.set("Name its roots", { verdict: "unsupported", reason: "The excerpts never mention roots." });
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(reusing()), (error: unknown) =>
    error instanceof ReuseUnfitError && /Name its roots/.test(error.reason) && error.grounding.length === 2);
  assert.equal(calls.length, 0, "A capability the reused Lesson cannot teach sends the slot to research.");
});

test("A reused Lesson is fitted and judged against an objective grounding rewrote, as a written Lesson is", async () => {
  const { generator, calls } = scriptedGenerator(fitReply("verbatim"));
  const { judge, grounded, calls: judgeCalls } = scriptedJudge();
  grounded.set("Name its roots", { verdict: "rewritten", text: "Name a root", reason: "The excerpts name one root." });
  const checked = await createReadingGenerator({ generator, judge }).generate(reusing());
  assert.deepEqual((calls[0]!.input as { slot: { objectives: string[] } }).slot.objectives, ["Describe Yggdrasil", "Name a root"]);
  assert.deepEqual((judgeCalls[0]!.input as { slot: { objectives: string[] } }).slot.objectives, ["Describe Yggdrasil", "Name a root"]);
  assert.deepEqual(checked.lesson.objectives, ["Describe Yggdrasil", "Name a root"]);
});

test("A Source vetted out when the reused Lesson was written stays out of its evidence", async () => {
  const { generator, calls } = scriptedGenerator(fitReply("adapt", authored("Yggdrasil is the world tree [src_aaaaaaaaaa].").sections.slice(0, 1)));
  const { judge, vettings } = scriptedJudge();
  const checked = await createReadingGenerator({ generator, judge }).generate(reusing({
    rejectedSources: [{ sourceId: BRIT.sourceId, url: BRIT.url, reason: "A shop's blog." }],
  }));
  assert.equal(vettings.length, 0);
  assert.deepEqual((calls[0]!.input as { sources: { sourceId: string }[] }).sources.map((entry) => entry.sourceId), [WIKI.sourceId]);
  assert.deepEqual(checked.rejectedSources, [{ sourceId: BRIT.sourceId, url: BRIT.url, reason: "A shop's blog." }]);
});

test("A verbatim Lesson a repair touches is adapted", async () => {
  const { generator, calls } = scriptedGenerator(fitReply("verbatim"), "fixture/author", TOUCH);
  const { judge } = scriptedJudge(UNSUPPORTED, "fixture/judge", PASS);
  const checked = await createReadingGenerator({ generator, judge }).generate(reusing());
  assert.deepEqual(calls.map((call) => call.schemaName), ["reading_reuse_fit", "cited_reading_repair"]);
  assert.equal(checked.repairs, 1);
  assert.deepEqual(checked.lesson.lineage, { originLessonId: "origin-lesson", mode: "adapted" });
  assert.deepEqual(checked.authorModelIds, ["origin/author", "fixture/author"]);
});

test("A reused Lesson still failing after its repairs is unfit; no fallback author writes it from another slot's Sources", async () => {
  const { generator } = scriptedGenerator(fitReply("verbatim"), "fixture/author", TOUCH);
  const { generator: fallbackGenerator, calls: fallbackCalls } = scriptedGenerator(authored(), "fixture/fallback");
  const { judge } = scriptedJudge(UNSUPPORTED);
  await assert.rejects(createReadingGenerator({ generator, fallbackGenerator, judge }).generate(reusing()), (error: unknown) =>
    error instanceof ReuseUnfitError && error.rounds.length === 3);
  assert.equal(fallbackCalls.length, 0);
});

test("A finished Lesson's numbered Citations turn back into the Source ID markers they were numbered from", () => {
  const evidence = lessonEvidence(INPUT.packs);
  const numbered = numberCitations(authored().sections, evidence);
  assert.deepEqual(authoredSections(numbered.body, numbered.sources), authored().sections.map((section) => ({
    ...section, paragraphs: section.paragraphs.map((paragraph) => paragraph.replace("[src_bbbbbbbbbb, src_aaaaaaaaaa]", "[src_bbbbbbbbbb][src_aaaaaaaaaa]")),
  })));
  assert.deepEqual(numberCitations(authoredSections(numbered.body, numbered.sources), evidence), numbered);
});

/** A public-domain Norse plate in the library, as the catalog holds it. */
function plate(overrides: Partial<MediaDescriptorFields> = {}): MediaDescriptorFields {
  return {
    id: "d0a1e001-0000-4000-8000-000000000001",
    kind: "image",
    origin: "library",
    license: "public_domain",
    licenseUrl: null,
    caption: "Yggdrasil, after Friedrich Wilhelm Heine (1886).",
    alt: "An engraving of a great ash tree.",
    source: { title: "File:Yggdrasil.jpg", author: "Friedrich Wilhelm Heine", url: "https://commons.wikimedia.org/wiki/File:Yggdrasil.jpg" },
    storageKey: "library/norse/yggdrasil-heine.jpg",
    mimeType: "image/jpeg",
    byteSize: 4,
    sha256: "a".repeat(64),
    width: 800,
    height: 1000,
    mediaCategory: "norse-mythic-depiction",
    topicTags: ["yggdrasil", "world-tree"],
    ...overrides,
  };
}

const PLATE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

/**
 * An in-memory library over `rows`; files are readable when their key is in `files`.
 * @param rows - The catalog
 * @param files - Storage key → bytes
 */
function library(rows: MediaDescriptorFields[], files: Record<string, Uint8Array> = { [plate().storageKey]: PLATE_BYTES }): MediaLibrary {
  return {
    async vocabulary() {
      const categories = [...new Set(rows.map((row) => row.mediaCategory))];
      return categories.map((mediaCategory) => ({ mediaCategory, topicTags: [...new Set(rows.filter((row) => row.mediaCategory === mediaCategory).flatMap((row) => row.topicTags))] }));
    },
    async candidates(mediaCategory, topicTags) {
      return rankCandidates(rows.filter((row) => row.mediaCategory === mediaCategory), topicTags);
    },
    async bytes(descriptor) {
      const bytes = files[descriptor.storageKey];
      if (!bytes) throw new Error(`No file at ${descriptor.storageKey}`);
      return bytes;
    },
  };
}

/** A library holding `rows`, every one of them readable. */
function readable(rows: MediaDescriptorFields[]): MediaLibrary {
  return library(rows, Object.fromEntries(rows.map((row) => [row.storageKey, PLATE_BYTES])));
}

/** The n-th Yggdrasil plate; plates rank by storage key, so plate 1 is tried first. */
function nthPlate(n: number): MediaDescriptorFields {
  return plate({ id: `d0a1e001-0000-4000-8000-00000000010${n}`, storageKey: `library/norse/yggdrasil-${n}.jpg`, caption: `Plate ${n} of Yggdrasil.` });
}

/** The slot's one planned visual: a depiction of the tree. */
const TREE_PLAN = { kind: "depiction" as const, intent: "Yggdrasil with its three roots and the beings around it, so the Learner sees how it holds the worlds together." };

/** INPUT, with a slot that plans the tree depiction. */
const PLANNING: ReadingInput = { ...INPUT, slot: { ...SLOT, visuals: [TREE_PLAN] } };

/** The writer's brief for the tree, as the reply writes it, after the first section. */
const BRIEF = {
  section: "The tree", subject: "Yggdrasil, the world ash, with its three roots and the beings around it",
  mustShow: ["exactly three roots", "an eagle in the crown", "a serpent at the roots"],
  caption: "Yggdrasil as this Course draws it: three roots, an eagle above and a serpent below.",
  alt: "A great tree with three roots; an eagle sits in its crown and a serpent coils at its base.",
  mediaCategory: "norse-mythic-depiction", topicTags: ["Yggdrasil", "world-tree"],
};

/** What the brief becomes once parsed: the plan's kind, slug tags. */
const PARSED_BRIEF: VisualBrief = { kind: "depiction", subject: BRIEF.subject, mustShow: BRIEF.mustShow, caption: BRIEF.caption, alt: BRIEF.alt, mediaCategory: "norse-mythic-depiction", topicTags: ["yggdrasil", "world-tree"] };

/** A first draft briefing each of `visuals`, or the tree alone. */
function briefing(...visuals: unknown[]) {
  return { ...authored(), visuals: visuals.length ? visuals : [BRIEF] };
}

/** A drawn illustration's descriptor, as the illustrator returns it. */
const DRAWN: MediaDescriptorFields = {
  id: "0a1b2c3d-4e5f-8000-8000-000000000000", kind: "image", origin: "generated", license: "product_owned", licenseUrl: null,
  caption: BRIEF.caption, alt: BRIEF.alt, source: null, storageKey: `generated/${"b".repeat(64)}.png`, mimeType: "image/png",
  byteSize: 10, sha256: "b".repeat(64), width: 1200, height: 800, mediaCategory: "norse-mythic-depiction", topicTags: ["yggdrasil", "world-tree"],
};

const VISION_FAIL: JudgeResult = { pass: false, failedChecks: ["must_show"], reasons: ["It shows a different tree."] };

/**
 * A scripted illustrator: each call gets the next outcome, repeating the last; an Error is thrown. Records every
 * brief and the authors it was told.
 * @param outcomes - `"illustrated"` draws `DRAWN`; `"judge_failed"` and `"error"` draw nothing
 */
function scriptedIllustrator(...outcomes: (Illustration["outcome"] | Error)[]) {
  const calls: { brief: VisualBrief; authorModelIds: readonly string[]; startedAt: number }[] = [];
  const illustrator: Illustrator = async (brief, authorModelIds) => {
    calls.push({ brief, authorModelIds, startedAt: calls.length });
    const outcome = outcomes[Math.min(calls.length, outcomes.length) - 1] ?? "illustrated";
    if (outcome instanceof Error) throw outcome;
    const attempt = { modelId: "fixture/illustrator", plan: null, judge: outcome === "illustrated" ? PASS : VISION_FAIL, judgeModelId: "fixture/vision" };
    return { outcome, descriptor: outcome === "illustrated" ? { ...DRAWN, topicTags: [...DRAWN.topicTags] } : null, attempts: outcome === "error" ? [{ ...attempt, judge: undefined, error: "timeout" }] : [attempt] };
  };
  return { illustrator, calls };
}

/**
 * The scripted Judge with the Vision Judge beside it: each `visual_fitness` call gets the next verdict, or throws when
 * the verdict is an Error. Records every vision request. The Vision Judge is built the way production builds it, over
 * the Judge port, so what it sends is what a real call sends.
 * @param verdicts - One per vision call, repeating the last
 */
function visionJudge(...verdicts: (unknown | Error)[]) {
  const scripted = scriptedJudge();
  const vision: (StructuredRequest<unknown> & { authorModelIds: readonly string[] })[] = [];
  const judge: Judge = {
    modelId: scripted.judge.modelId,
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
      if (request.schemaName !== "visual_fitness") return scripted.judge.judge(request);
      vision.push(request as StructuredRequest<unknown> & { authorModelIds: readonly string[] });
      const verdict = verdicts[Math.min(vision.length, verdicts.length) - 1] ?? PASS;
      if (verdict instanceof Error) throw verdict;
      return { value: request.parse(verdict), modelId: "fixture/vision" };
    },
  };
  return { ...scripted, judge, vision, judgeVisual: createVisualJudge({ judge, techniqueJudge: judge }) };
}

/** Every media block in a Lesson body. */
function mediaBlocks(body: { sections: { blocks: { kind: string }[] }[] }): MediaBlock[] {
  return body.sections.flatMap((section) => section.blocks).filter((block): block is MediaBlock => block.kind === "media");
}

test("The writer briefs each visual its slot plans, with the plan's kind; the illustrator draws it and the picture follows its section (SEN-121)", async () => {
  const { generator, calls } = scriptedGenerator(briefing());
  const { judge, vision } = visionJudge(PASS);
  const drawn = scriptedIllustrator("illustrated");
  const checked = await createReadingGenerator({ generator, judge, media: readable([plate()]), illustrator: drawn.illustrator }).generate(PLANNING);

  const author = calls[0]!;
  assert.match(author.systemPrompt, /"slot\.visuals" lists the pictures this Lesson is planned to show/);
  assert.match(author.systemPrompt, /the prose never refers to it/);
  assert.deepEqual((author.input as { slot: { visuals: unknown } }).slot.visuals, [TREE_PLAN]);
  assert.deepEqual((author.input as { mediaCatalog: unknown }).mediaCatalog, [{ mediaCategory: "norse-mythic-depiction", topicTags: ["yggdrasil", "world-tree"] }], "The library's tags are offered so a file of the same thing is found.");
  const schema = author.schema as { required: string[]; properties: { visuals: { minItems: number; maxItems: number; items: { properties: { mediaCategory: { enum: string[] }; mustShow: { maxItems: number } } } } } };
  assert.deepEqual(schema.required, ["sections", "visuals"]);
  assert.deepEqual([schema.properties.visuals.minItems, schema.properties.visuals.maxItems], [1, 1], "One brief per planned visual, no more.");
  assert.ok(schema.properties.visuals.items.properties.mediaCategory.enum.includes("drum-grip"), "Any library category may be named.");
  assert.equal(schema.properties.visuals.items.properties.mustShow.maxItems, 6);

  assert.equal(drawn.calls.length, 1);
  assert.deepEqual(drawn.calls[0]!.brief, PARSED_BRIEF, "The illustrator gets the brief with the plan's kind and slug tags.");
  assert.deepEqual(drawn.calls[0]!.authorModelIds, ["fixture/author"], "The brief's writer is ruled out of judging the picture.");
  assert.equal(vision.length, 0, "A drawn picture that passed is not judged again here, and the library is not tried.");

  const [block, ...extra] = mediaBlocks(checked.lesson.body);
  assert.equal(extra.length, 0);
  assert.equal(checked.lesson.body.sections[0]!.blocks.at(-1), block, "The picture follows the section its brief names.");
  assert.deepEqual([block!.caption, block!.alt], [BRIEF.caption, BRIEF.alt]);
  assert.deepEqual(block!.descriptor, DRAWN, "The Lesson keeps the generated descriptor.");
  assert.deepEqual(checked.visuals.map(({ status, descriptorId }) => [status, descriptorId]), [["illustrated", DRAWN.id]]);
  assert.deepEqual(checked.visuals[0]!.illustration, { outcome: "illustrated", attempts: [{ modelId: "fixture/illustrator", judge: PASS, judgeModelId: "fixture/vision" }] }, "The plans stay on the illustration event; the Reading keeps the verdicts.");
  assert.deepEqual(checked.rounds[0]!.visuals, [{ section: "The tree", brief: PARSED_BRIEF }]);
  assert.deepEqual(checked.rounds[0]!.attached, checked.visuals);
});

test("A drawing the Judge failed twice falls back to the library, whose best files are judged against the brief; then Commons; then no image", async () => {
  const { generator } = scriptedGenerator(briefing());
  const scripted = visionJudge(VISION_FAIL, PASS);
  const other = plate({ id: "d0a1e001-0000-4000-8000-000000000002", storageKey: "library/norse/valhalla.jpg", topicTags: ["valhalla"] });
  const checked = await createReadingGenerator({
    generator, judge: scripted.judge, media: readable([other, nthPlate(1), nthPlate(2), nthPlate(3)]), illustrator: scriptedIllustrator("judge_failed").illustrator,
  }).generate(PLANNING);

  assert.equal(scripted.vision.length, 2, "Plate 1 fails, plate 2 passes; plate 3 is never looked at.");
  assert.deepEqual(scripted.vision[0]!.input, { brief: { kind: "depiction", subject: BRIEF.subject, mustShow: BRIEF.mustShow, caption: BRIEF.caption, alt: BRIEF.alt } }, "A library file is judged against the brief, mustShow included.");
  assert.deepEqual(scripted.vision[0]!.images, [{ mimeType: "image/jpeg", bytes: PLATE_BYTES }]);
  assert.deepEqual(scripted.vision[0]!.authorModelIds, ["fixture/author"]);
  assert.match(scripted.vision[0]!.systemPrompt, /Lenient on style, strict on facts/);
  const [outcome] = checked.visuals;
  assert.equal(outcome!.status, "library");
  assert.equal(outcome!.illustration!.outcome, "judge_failed");
  assert.deepEqual(outcome!.library.map(({ storageKey, judge }) => [storageKey, judge?.pass]), [[nthPlate(1).storageKey, false], [nthPlate(2).storageKey, true]]);
  assert.equal(mediaBlocks(checked.lesson.body)[0]!.descriptor.id, nthPlate(2).id);
  assert.equal(checked.repairs, 0, "A picture that fails costs no Lesson repair.");

  // Every library file fails: Commons is searched with the brief and a Judge that rules out the brief's writer.
  const commonsCalls: { brief: VisualBrief }[] = [];
  const found = { ...plate({ id: "d0a1e001-0000-4000-8000-00000000c0de", storageKey: `library/commons/${"c".repeat(64)}.jpg` }), source: { title: "File:Tree.jpg", author: "Someone", url: "https://commons.wikimedia.org/wiki/File:Tree.jpg" } };
  const commons: CommonsFinder = async (brief, judge) => {
    commonsCalls.push({ brief });
    const verdict = await judge({ bytes: PLATE_BYTES, mimeType: "image/jpeg" }, brief);
    return { descriptor: verdict.pass ? found : null, outcome: verdict.pass ? "ingested" : "miss", queries: ["yggdrasil"], searchErrors: [], tried: [], rejected: [] };
  };
  const failing = visionJudge(VISION_FAIL, VISION_FAIL, PASS);
  const fromCommons = await createReadingGenerator({
    generator: scriptedGenerator(briefing()).generator, judge: failing.judge, media: readable([nthPlate(1), nthPlate(2), nthPlate(3)]),
    illustrator: scriptedIllustrator("judge_failed").illustrator, commons,
  }).generate(PLANNING);
  assert.equal(failing.vision.length, 3, "Two library files at most, then the Commons file.");
  assert.deepEqual(commonsCalls.map(({ brief }) => brief), [PARSED_BRIEF]);
  assert.deepEqual(failing.vision[2]!.authorModelIds, ["fixture/author"], "The Commons Judge rules out the brief's writer too.");
  assert.equal(fromCommons.visuals[0]!.status, "commons");
  assert.equal(fromCommons.visuals[0]!.commons!.outcome, "ingested");
  assert.equal(mediaBlocks(fromCommons.lesson.body)[0]!.descriptor.id, found.id);

  // Nothing passes anywhere: the Lesson publishes with no image, and that is not a defect.
  const nothing = visionJudge(VISION_FAIL);
  const without = await createReadingGenerator({
    generator: scriptedGenerator(briefing()).generator, judge: nothing.judge, media: readable([nthPlate(1)]), illustrator: scriptedIllustrator("judge_failed").illustrator, commons,
  }).generate(PLANNING);
  assert.equal(without.visuals[0]!.status, "none");
  assert.equal(without.visuals[0]!.commons!.outcome, "miss");
  assert.deepEqual(mediaBlocks(without.lesson.body), []);
  assert.equal(without.judge.pass, true);
});

test("A technique is never drawn: the library, then Commons, judged on the technique Judge with the harsh rule", async () => {
  const grip = { kind: "technique" as const, intent: "Matched grip from above, so the fulcrum shows." };
  const gripBrief = { ...BRIEF, section: "Roots", subject: "A right hand holding a drumstick in matched grip", mustShow: ["the stick pinched between thumb and index finger"], mediaCategory: "drum-grip", topicTags: ["matched-grip"] };
  const photo = plate({ id: "d0a1e001-0000-4000-8000-00000000d0d0", storageKey: "library/drums/grip.jpg", mediaCategory: "drum-grip", topicTags: ["matched-grip"], source: { title: "File:Grip.jpg", author: "A", url: "https://commons.wikimedia.org/wiki/File:Grip.jpg" } });
  const { generator } = scriptedGenerator(briefing(gripBrief));
  const drawn = scriptedIllustrator("illustrated");
  const technique: (StructuredRequest<unknown> & { authorModelIds: readonly string[] })[] = [];
  const techniqueJudge: Judge = {
    modelId: "fixture/technique-judge",
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
      technique.push(request as StructuredRequest<unknown> & { authorModelIds: readonly string[] });
      return { value: request.parse(PASS), modelId: "fixture/technique-judge" };
    },
  };
  const scripted = visionJudge(PASS);
  const checked = await createReadingGenerator({
    generator, judge: scripted.judge, media: readable([photo]), illustrator: drawn.illustrator,
    judgeVisual: createVisualJudge({ judge: scripted.judge, techniqueJudge }),
  }).generate({ ...INPUT, slot: { ...SLOT, visuals: [grip] } });

  assert.equal(drawn.calls.length, 0, "A technique skips the illustrator (decision 2026-11-03).");
  assert.equal(scripted.vision.length, 0);
  assert.equal(technique.length, 1, "The technique Judge, on its own model, judged the photo.");
  assert.match(technique[0]!.systemPrompt, /Be harsh/);
  assert.equal((technique[0]!.input as { brief: { kind: string } }).brief.kind, "technique");
  assert.equal(checked.visuals[0]!.status, "library");
  assert.equal(checked.visuals[0]!.illustration, undefined);
  assert.equal(checked.visuals[0]!.library[0]!.judgeModelId, "fixture/technique-judge");
  assert.equal(mediaBlocks(checked.lesson.body)[0]!.descriptor.id, photo.id);
  assert.equal(checked.lesson.body.sections[1]!.blocks.at(-1)!.kind, "media", "The photo follows the section the brief names.");
});

test("A picture is searched for while the prose is judged and repaired, and placed once it passes; a section the repairs cut leaves it out", async () => {
  const fail = { pass: false, failedChecks: ["claim_support"], reasons: ["Roots are unsupported."] };
  const { generator } = scriptedGenerator(briefing(), "fixture/author", TOUCH);
  const scripted = visionJudge(PASS);
  let lessonVerdicts = 0;
  const order: string[] = [];
  const judge: Judge = {
    modelId: scripted.judge.modelId,
    async judge(request) {
      if (request.schemaName === "reading_lesson_review") {
        order.push("lesson judge");
        return { value: request.parse(lessonVerdicts++ === 0 ? fail : PASS), modelId: "fixture/judge" };
      }
      return scripted.judge.judge(request);
    },
  };
  let release!: () => void;
  const slow: Illustrator = async (brief, authorModelIds) => {
    order.push("illustrator started");
    await new Promise<void>((resolve) => { release = resolve; });
    order.push("illustrator finished");
    return (await scriptedIllustrator("illustrated").illustrator(brief, authorModelIds));
  };
  const run = createReadingGenerator({ generator, judge, media: readable([plate()]), illustrator: slow }).generate(PLANNING);
  // The illustrator was started by the first draft and is still drawing while the Lesson is judged and repaired.
  while (order.filter((step) => step === "lesson judge").length < 2) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.deepEqual(order, ["illustrator started", "lesson judge", "lesson judge"]);
  release();
  const repaired = await run;
  assert.equal(repaired.repairs, 1);
  assert.equal(repaired.visuals[0]!.status, "illustrated");
  assert.equal(order.at(-1), "illustrator finished");

  const { generator: misnamed } = scriptedGenerator(briefing({ ...BRIEF, section: "A heading no draft has" }));
  const unplaced = await createReadingGenerator({ generator: misnamed, judge: visionJudge(PASS).judge, media: readable([plate()]), illustrator: scriptedIllustrator("illustrated").illustrator }).generate(PLANNING);
  assert.equal(unplaced.visuals[0]!.status, "unplaced");
  assert.equal(unplaced.visuals[0]!.descriptorId, DRAWN.id, "The picture was drawn; only its section is gone.");
  assert.deepEqual(mediaBlocks(unplaced.lesson.body), []);

  const { generator: loosely } = scriptedGenerator(briefing({ ...BRIEF, section: "  the  TREE " }));
  const placed = await createReadingGenerator({ generator: loosely, judge: visionJudge(PASS).judge, media: readable([plate()]), illustrator: scriptedIllustrator("illustrated").illustrator }).generate(PLANNING);
  assert.equal(placed.visuals[0]!.status, "illustrated", "A heading named with other case or spacing still places the picture.");
});

test("A draft that does not brief every planned visual, briefs one hollow, or names a category the library does not know is invalid output", async () => {
  for (const draft of [authored(), { ...authored(), visuals: [] }, briefing({ ...BRIEF, caption: " " }), briefing({ ...BRIEF, mustShow: [] }), briefing({ ...BRIEF, mediaCategory: "selfies" })]) {
    const { generator } = scriptedGenerator(draft);
    await assert.rejects(
      createReadingGenerator({ generator, judge: visionJudge(PASS).judge, media: readable([plate()]) }).generate(PLANNING),
      (error: unknown) => error instanceof ModelError && error.code === "invalid_output",
    );
  }
});

test("Two planned visuals are briefed in order, never share a file, and a Reading shows a found file once", async () => {
  const second = { ...BRIEF, section: "Roots", subject: "The three roots of Yggdrasil and what lies under each", mustShow: ["three roots", "a well under one root"] };
  const { generator } = scriptedGenerator(briefing(BRIEF, second));
  const scripted = visionJudge(PASS);
  const twice = { ...INPUT, slot: { ...SLOT, visuals: [TREE_PLAN, { kind: "diagram" as const, intent: "The three roots and what lies under each." }] } };
  const checked = await createReadingGenerator({ generator, judge: scripted.judge, media: readable([nthPlate(1), nthPlate(2)]), illustrator: scriptedIllustrator("judge_failed").illustrator }).generate(twice);
  assert.deepEqual(checked.visuals.map(({ status, placement }) => [status, placement.brief.kind, placement.section]), [["library", "depiction", "The tree"], ["library", "diagram", "Roots"]]);
  const blocks = mediaBlocks(checked.lesson.body);
  assert.deepEqual(blocks.map((block) => block.descriptor.id), [nthPlate(1).id, nthPlate(2).id], "The second visual skips the file the first took.");
  assert.equal(scripted.vision.length, 2);

  // The illustrator draws the same picture for both (the same plan, the same bytes): the Lesson shows it once.
  const same = await createReadingGenerator({ generator: scriptedGenerator(briefing(BRIEF, second)).generator, judge: visionJudge(PASS).judge, media: readable([]), illustrator: scriptedIllustrator("illustrated").illustrator }).generate(twice);
  assert.deepEqual(same.visuals.map(({ status }) => status), ["illustrated", "duplicate"]);
  assert.equal(mediaBlocks(same.lesson.body).length, 1);
});

test("A provider failure on one source is recorded and the next source is tried; a lost job stops the run", async () => {
  const { generator } = scriptedGenerator(briefing());
  const erroring = visionJudge(new ModelError("timeout"), PASS);
  const checked = await createReadingGenerator({ generator, judge: erroring.judge, media: readable([nthPlate(1), nthPlate(2)]), illustrator: scriptedIllustrator("error").illustrator }).generate(PLANNING);
  assert.equal(checked.visuals[0]!.illustration!.outcome, "error");
  assert.deepEqual(checked.visuals[0]!.library.map(({ error, judge }) => [error ? /timeout/.test(error) : null, judge?.pass ?? null]), [[true, null], [null, true]]);
  assert.equal(checked.visuals[0]!.status, "library");

  const commonsDown: CommonsFinder = async () => { throw new Error("[commons-ingest.ts: findVisualOnCommons] Failed to add a Commons file to the library || bucket down"); };
  const noCommons = await createReadingGenerator({ generator: scriptedGenerator(briefing()).generator, judge: visionJudge(VISION_FAIL).judge, media: readable([nthPlate(1)]), commons: commonsDown }).generate(PLANNING);
  assert.equal(noCommons.visuals[0]!.status, "none");
  assert.match(noCommons.visuals[0]!.commonsError!, /bucket down/);
  assert.equal(noCommons.judge.pass, true, "The Lesson still passes.");

  const lost = visionJudge(new LeaseLostError("job1"));
  await assert.rejects(createReadingGenerator({ generator: scriptedGenerator(briefing()).generator, judge: lost.judge, media: readable([nthPlate(1)]) }).generate(PLANNING), LeaseLostError);
});

test("Deterministic checks skip an unhostable or unreadable file before any vision call, and an SVG is judged as a PNG and kept as the SVG", async () => {
  const nonCommercial = plate({ id: "d0a1e001-0000-4000-8000-00000000000a", storageKey: "library/norse/a-nc.jpg", license: "cc_by_nc" as MediaLicense });
  const unreadable = plate({ id: "d0a1e001-0000-4000-8000-00000000000b", storageKey: "library/norse/b-gone.jpg" });
  const { generator } = scriptedGenerator(briefing());
  const { judge, vision } = visionJudge(PASS);
  const checked = await createReadingGenerator({ generator, judge, media: library([nonCommercial, unreadable, plate()]) }).generate(PLANNING);
  assert.equal(vision.length, 1);
  assert.equal(mediaBlocks(checked.lesson.body)[0]!.descriptor.id, plate().id);
  const [outcome] = checked.visuals;
  assert.equal(outcome!.status, "library");
  assert.deepEqual(outcome!.library.map(({ storageKey }) => storageKey), [nonCommercial.storageKey, unreadable.storageKey, plate().storageKey]);
  assert.match(outcome!.library[0]!.failures!.join(" "), /not one the product can host/);
  assert.match(outcome!.library[1]!.failures!.join(" "), /No file at/);

  const svg = await readFile(resolve(CATALOG_DIR, "drums/rebound-stroke.svg"));
  const unsafe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const diagram = (overrides: Partial<MediaDescriptorFields>) => plate({ license: "product_owned", source: null, licenseUrl: null, mimeType: "image/svg+xml", mediaCategory: "drum-stroke", ...overrides });
  const strip = diagram({ id: "d0a1e047-0000-4000-8000-000000000028", storageKey: "library/drums/rebound-stroke.svg", topicTags: ["rebound-stroke", "full-stroke"] });
  const scripted = diagram({ id: "d0a1e047-0000-4000-8000-000000000099", storageKey: "library/drums/a-scripted.svg", topicTags: ["rebound-stroke", "full-stroke", "stroke"] });
  const strokeBrief = { ...BRIEF, subject: "A full stroke in four stills", mustShow: ["four stills"], mediaCategory: "drum-stroke", topicTags: ["rebound-stroke", "stroke"] };
  const seen = visionJudge(PASS);
  const stroke = await createReadingGenerator({
    generator: scriptedGenerator(briefing(strokeBrief)).generator, judge: seen.judge, media: library([strip, scripted], { [strip.storageKey]: svg, [scripted.storageKey]: unsafe }),
  }).generate({ ...INPUT, slot: { ...SLOT, visuals: [{ kind: "diagram", intent: "The four heights of a full stroke." }] } });
  assert.match(stroke.visuals[0]!.library[0]!.failures!.join(" "), /The SVG holds a script/, "The best-ranked file is unsafe and skipped.");
  const [image] = seen.vision[0]!.images!;
  assert.equal(image!.mimeType, "image/png");
  assert.deepEqual([...image!.bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(mediaBlocks(stroke.lesson.body)[0]!.descriptor.mimeType, "image/svg+xml", "The Learner is served the SVG itself.");
});

test("A Lesson's descriptor is a copy: editing the catalog afterwards cannot change it", async () => {
  const row = plate();
  const { generator } = scriptedGenerator(briefing());
  const checked = await createReadingGenerator({ generator, judge: visionJudge(PASS).judge, media: library([row]) }).generate(PLANNING);
  row.caption = "Edited later.";
  row.topicTags.push("edited");
  row.source!.author = "Someone else";
  assert.deepEqual(mediaBlocks(checked.lesson.body)[0]!.descriptor, plate());
});

test("A reused Lesson briefs the visuals its new slot plans; its own pictures are not carried over", async () => {
  const { generator, calls } = scriptedGenerator({ ...fitReply("verbatim"), visuals: [BRIEF] });
  const { judge, vision } = visionJudge(PASS);
  const checked = await createReadingGenerator({ generator, judge, media: readable([nthPlate(1)]) }).generate({ ...PLANNING, reuse: SEED });

  assert.match(calls[0]!.systemPrompt, /"slot\.visuals" lists the pictures/);
  assert.ok((calls[0]!.schema as { required: string[] }).required.includes("visuals"));
  assert.deepEqual(checked.visuals.map(({ placement, status }) => [placement.section, status]), [["The tree", "library"]]);
  assert.equal(vision.length, 1);
  assert.equal(checked.lesson.lineage?.mode, "verbatim", "Briefing a visual does not make a verbatim Lesson adapted.");

  const { generator: plain, calls: fitCalls } = scriptedGenerator(fitReply("verbatim"));
  const without = await createReadingGenerator({ generator: plain, judge: visionJudge(PASS).judge, media: readable([nthPlate(1)]) }).generate(reusing());
  assert.deepEqual(without.visuals, [], "A slot that plans nothing briefs nothing.");
  assert.doesNotMatch(fitCalls[0]!.systemPrompt, /slot\.visuals/);

  const { generator: unbriefed } = scriptedGenerator(fitReply("verbatim"));
  await assert.rejects(createReadingGenerator({ generator: unbriefed, judge: visionJudge(PASS).judge, media: readable([nthPlate(1)]) }).generate({ ...PLANNING, reuse: SEED }),
    (error: unknown) => error instanceof ModelError && error.code === "invalid_output");
});

test("With no media library (READING_MEDIA=off) a slot's planned visuals are not briefed, so the Lesson is written with none", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge } = visionJudge(PASS);
  const checked = await createReadingGenerator({ generator, judge }).generate(PLANNING);

  const author = calls[0]!;
  assert.equal((author.input as { slot: { visuals?: unknown } }).slot.visuals, undefined);
  assert.equal((author.schema as { properties: Record<string, unknown> }).properties.visuals, undefined);
  assert.doesNotMatch(author.systemPrompt, /slot\.visuals|mediaCatalog/);
  assert.deepEqual(checked.visuals, []);
});

test("A passing Reading gets a word list: a word not in the prose and one the glossary Judge rejects are dropped (SEN-48)", async () => {
  const { generator, glossaries, terms } = scriptedGenerator(authored());
  terms.push(
    { term: "world tree", definition: "The great tree that holds up the Norse worlds." },
    { term: "roots", definition: "The parts of the tree that reach down." },
    { term: "Bifrost", definition: "A rainbow bridge." },
  );
  const { judge, glossaryReviews, rejectedTerms } = scriptedJudge();
  rejectedTerms.push("roots");
  const checked = await createReadingGenerator({ generator, judge }).generate(INPUT);

  assert.deepEqual(checked.lesson.body.glossary, [{ term: "world tree", definition: "The great tree that holds up the Norse worlds." }]);
  assert.deepEqual(checked.glossary.rejected, [
    { term: "Bifrost", reason: "Not in the Lesson's prose as written." },
    { term: "roots", reason: "Says more than the excerpts." },
  ]);
  assert.equal(glossaries.length, 1);
  // The writer and the Judge see the finished Lesson with its excerpts; the Judge only the words found in the prose.
  const shown = glossaryReviews[0]!.input as { glossary: { term: string }[]; lesson: { sources: { n: number; excerpts: string[] }[] } };
  assert.deepEqual(shown.glossary.map(({ term }) => term), ["world tree", "roots"]);
  assert.deepEqual(shown.lesson.sources[1], { n: 2, excerpts: ["It has three roots."] });
  assert.deepEqual(glossaryReviews[0]!.authorModelIds, ["fixture/author"]);
});

test("The Course keeps one meaning per word: a word a prior Lesson defined keeps that definition by code, the writer sees priorTerms, and the author sees what the Learner asked (decision 2026-11-03)", async () => {
  const { generator, glossaries, terms, calls } = scriptedGenerator(authored());
  terms.push({ term: "world tree", definition: "A tree the writer defined differently this time." }, { term: "roots", definition: "The parts of a tree under the ground." });
  const { judge } = scriptedJudge();
  const priorLessons = [{
    title: "Before", lessonGoal: "Know the tree.", objectives: ["Name it"], headings: ["Tree"],
    terms: [{ term: "World Tree", definition: "The great tree that holds up the Norse worlds." }],
  }];
  const checked = await createReadingGenerator({ generator, judge }).generate({ ...INPUT, priorLessons, learnerAsked: "what is the tree and why does it matter" });

  assert.deepEqual(checked.lesson.body.glossary, [
    { term: "world tree", definition: "The great tree that holds up the Norse worlds." },
    { term: "roots", definition: "The parts of a tree under the ground." },
  ], "The prior definition wins, under the term as this Lesson writes it; a new word keeps the writer's definition.");
  const shown = glossaries[0]!.input as { priorTerms?: { term: string; definition: string }[] };
  assert.deepEqual(shown.priorTerms, [{ term: "World Tree", definition: "The great tree that holds up the Norse worlds." }]);
  assert.match(glossaries[0]!.systemPrompt, /one meaning per word/);
  assert.equal((calls[0]!.input as { learnerAsked?: string }).learnerAsked, "what is the tree and why does it matter");
  assert.match(calls[0]!.systemPrompt, /"learnerAsked" is present, it is what the Learner said they want/);
  assert.match(calls[0]!.systemPrompt, /at most three words the Learner does not know yet/);
});

test("No word list when the writer finds no hard words, and a provider failure leaves the Lesson without one rather than failing it", async () => {
  const { generator } = scriptedGenerator(authored());
  const { judge, glossaryReviews } = scriptedJudge();
  const plain = await createReadingGenerator({ generator, judge }).generate(INPUT);
  assert.equal(plain.lesson.body.glossary, undefined);
  assert.equal(glossaryReviews.length, 0, "Nothing to check, so the Judge is not asked.");

  const scripted = scriptedGenerator(authored());
  const failing: Generator = {
    modelId: scripted.generator.modelId,
    async generateStructured(request) {
      if (request.schemaName === "reading_glossary") throw new ModelError("timeout");
      return scripted.generator.generateStructured(request);
    },
  };
  const checked = await createReadingGenerator({ generator: failing, judge: scriptedJudge().judge }).generate(INPUT);
  assert.equal(checked.lesson.body.glossary, undefined);
  assert.equal(checked.judge.pass, true);
  assert.ok(checked.glossary.error);
});

test("The Starting Level reaches the author, repair, Judge, and word list, each prompt with the level rule; without one, nothing changes", async () => {
  const startingLevel = {
    extremity: "floor" as const, coverageNote: "", learningGoal: INPUT.learningGoal, selfReportedNew: true as const,
    probedCapabilities: [], remainingGapStatement: "You're new to this.",
  };
  const { generator, calls, glossaries } = scriptedGenerator(authored(), "fixture/author", TOUCH);
  const { judge, calls: judgeCalls } = scriptedJudge(UNSUPPORTED, "fixture/judge", PASS);
  await createReadingGenerator({ generator, judge }).generate({ ...INPUT, startingLevel });

  const expected = { extremity: "floor", inPlace: [], remainingGap: [], newToSubject: true };
  for (const call of [...calls, ...judgeCalls, ...glossaries]) assert.deepEqual((call.input as { learnerLevel: unknown }).learnerLevel, expected);
  for (const call of [...calls, ...judgeCalls]) assert.match(call.systemPrompt, /"learnerLevel" is where this Learner starts/);

  const bare = scriptedGenerator(authored(), "fixture/author", TOUCH);
  const bareJudge = scriptedJudge(UNSUPPORTED, "fixture/judge", PASS);
  await createReadingGenerator({ generator: bare.generator, judge: bareJudge.judge }).generate(INPUT);
  for (const call of [...bare.calls, ...bareJudge.calls]) {
    assert.ok(!("learnerLevel" in (call.input as object)));
    assert.doesNotMatch(call.systemPrompt, /"learnerLevel" is where this Learner starts/);
  }
});

test("A question to the Learner fails the Code checks, and the repair rewrites it as a statement, in a heading too", async () => {
  const asking = { sections: [
    { heading: "Why a tree?", paragraphs: ["Yggdrasil is the world tree [src_aaaaaaaaaa]. Can you say what it holds?"] },
    { heading: "Roots", paragraphs: ["It has three roots [src_bbbbbbbbbb]."] },
  ] };
  const fix = edits(["Why a tree?", "The tree at the centre"], ["Can you say what it holds?", "It holds the worlds together."]);
  const { generator, calls } = scriptedGenerator(asking, "fixture/author", fix);
  const { lesson, repairs } = await createReadingGenerator({ generator, judge: scriptedJudge().judge }).generate(INPUT);

  assert.equal(repairs, 1);
  const problems = (calls[1]!.input as { problems: string[] }).problems;
  assert.match(problems[0]!, /A Reading asks the Learner no questions.*"Why a tree\?".*"Can you say what it holds\?"/);
  assert.equal(lesson.body.sections[0]!.heading, "The tree at the centre");
  assert.equal((lesson.body.sections[0]!.blocks[0]! as ProseBlock).text, "Yggdrasil is the world tree [1]. It holds the worlds together.");
});

test("A repair edit matches a heading only when no paragraph has the passage, and never empties it", () => {
  const draft = [{ heading: "Roots", paragraphs: ["Roots again."] }, { heading: "Branches?", paragraphs: ["Up high."] }];
  const { sections, applied, skipped } = applyRepairEdits(draft, [
    { find: "Roots", replace: "Stems" },
    { find: "Branches?", replace: "Branches" },
    { find: "Branches", replace: "" },
  ]);
  assert.deepEqual(sections.map(({ heading }) => heading), ["Roots", "Branches"], "The paragraph that has the passage is edited, not the heading.");
  assert.equal((sections[0]!.paragraphs[0]), "Stems again.");
  assert.equal(applied, 2);
  assert.deepEqual(skipped, ["Branches"]);
});

/** A second Reading of the World Tree's Chapter: the roots, with their own objective. */
const SLOT2: BlueprintSlot = {
  id: "slot2", method: "reading", title: "The Roots", lessonGoal: "Name the three roots and where they reach.",
  objectives: ["Name its roots"], topicTags: ["yggdrasil", "roots"], assessesSlotIds: [], chapter: "The tree",
};

/**
 * A Chapter of the given slots, drafted from INPUT's Course and packs.
 * @param slots - Its Readings, in order
 */
function chapterInput(...slots: BlueprintSlot[]): ChapterInput {
  const { slot: single, ...shared } = INPUT;
  void single;
  return { ...shared, chapter: "The tree", slots };
}

test("A Chapter is drafted in one author call, vetted once, grounded per slot, and each Lesson is finished on its own (decision 2026-11-03)", async () => {
  const { generator, calls, glossaries } = scriptedGenerator({ lessons: { slot1: authored(), slot2: authored("The roots reach three places [src_bbbbbbbbbb].") } });
  const { judge, calls: judgeCalls, vettings, groundings } = scriptedJudge();
  const reading = createReadingGenerator({ generator, judge });
  const draft = await reading.draftChapter!(chapterInput({ ...SLOT, chapter: "The tree" }, SLOT2));

  assert.deepEqual(calls.map((call) => call.schemaName), ["cited_chapter"]);
  assert.equal(vettings.length, 1, "The Chapter's Lessons share their packs, so vetting runs once.");
  assert.equal(groundings.length, 2, "Each Lesson is grounded against its own objectives.");
  const told = calls[0]!.input as { chapter: { title: string; slots: { slotId: string; objectives: string[] }[] }; sources: unknown[]; slot?: unknown };
  assert.equal(told.chapter.title, "The tree");
  assert.deepEqual(told.chapter.slots.map((slot) => slot.slotId), ["slot1", "slot2"]);
  assert.deepEqual(told.chapter.slots[1]!.objectives, SLOT2.objectives);
  assert.equal(told.slot, undefined);
  assert.equal(told.sources.length, 2, "The Sources are sent once for the whole Chapter.");
  assert.ok(calls[0]!.systemPrompt.includes(READING_STYLE));
  assert.match(calls[0]!.systemPrompt, /under its slotId in "lessons"/);
  assert.deepEqual(draft.lessons.map((lesson) => lesson.slotId), ["slot1", "slot2"]);
  assert.equal(judgeCalls.length, 0, "Nothing is judged until a Lesson is finished.");

  const first = await draft.finish("slot1", []);
  assert.equal(first.lesson.slotId, "slot1");
  assert.equal(first.lesson.title, SLOT.title);
  assert.equal((first.lesson.body.sections[0]!.blocks[0]! as ProseBlock).text, "Yggdrasil is the world tree [1]. It has three roots [2][1].");
  assert.deepEqual(first.authorModelIds, ["fixture/author"]);
  assert.equal(first.repairs, 0);
  assert.equal(first.lesson.lineage, null);
  assert.equal(calls.length, 1, "A Chapter Lesson that passes costs no author call of its own.");
  assert.equal(glossaries.length, 1, "The word list stays per Lesson.");

  const prior = { title: first.lesson.title, lessonGoal: first.lesson.lessonGoal, objectives: first.lesson.objectives, headings: ["The tree", "Roots"] };
  const second = await draft.finish("slot2", [prior]);
  assert.equal(second.lesson.slotId, "slot2");
  assert.equal(second.lesson.title, SLOT2.title);
  assert.equal((second.lesson.body.sections[0]!.blocks[0]! as ProseBlock).text, "The roots reach three places [1].");
  assert.deepEqual((judgeCalls[1]!.input as { priorLessons: unknown[] }).priorLessons, [prior], "A later Lesson of the Chapter is judged against the earlier one.");
  assert.equal(glossaries.length, 2);
  await assert.rejects(draft.finish("slot2", [prior]), /finished already/);
  await assert.rejects(reading.draftChapter!(chapterInput(SLOT)), /at least two Lessons/);
});

test("A Chapter's Lessons brief their visuals in their own entries, and every picture is searched for as soon as the Chapter is drafted", async () => {
  const second = { ...BRIEF, section: "Roots", subject: "The roots" };
  const { generator, calls } = scriptedGenerator({ lessons: { slot1: briefing(), slot2: briefing(second) } });
  const drawn = scriptedIllustrator("illustrated");
  const scripted = visionJudge(PASS);
  const slots: BlueprintSlot[] = [{ ...SLOT, chapter: "The tree", visuals: [TREE_PLAN] }, { ...SLOT2, visuals: [{ kind: "diagram", intent: "The roots." }] }];
  const draft = await createReadingGenerator({ generator, judge: scripted.judge, media: readable([plate()]), illustrator: drawn.illustrator }).draftChapter!(chapterInput(...slots));

  assert.match(calls[0]!.systemPrompt, /"slot\.visuals" lists the pictures/);
  assert.match(calls[0]!.systemPrompt, /"visuals" is written inside each Lesson's own entry/);
  assert.ok("mediaCatalog" in (calls[0]!.input as object));
  const told = calls[0]!.input as { chapter: { slots: { visuals?: unknown }[] } };
  assert.deepEqual(told.chapter.slots.map((slot) => slot.visuals), [[TREE_PLAN], [{ kind: "diagram", intent: "The roots." }]]);
  const schema = calls[0]!.schema as { properties: { lessons: { properties: Record<string, { required: string[] }> } } };
  assert.deepEqual(schema.properties.lessons.properties.slot2!.required, ["sections", "visuals"]);
  assert.deepEqual(draft.lessons.map(({ visuals }) => visuals.map(({ brief }) => brief.subject)), [[BRIEF.subject], [second.subject]]);
  assert.equal(drawn.calls.length, 2, "Both Lessons' pictures are being drawn before either Lesson is finished.");
  assert.deepEqual(drawn.calls.map(({ authorModelIds }) => authorModelIds), [["fixture/author"], ["fixture/author"]]);

  const first = await draft.finish("slot1", []);
  assert.equal(first.visuals[0]!.status, "illustrated");
  assert.equal(drawn.calls.length, 2, "Finishing a Lesson draws nothing new.");
  const next = await draft.finish("slot2", []);
  assert.equal(next.visuals[0]!.status, "illustrated", "The fixture drew the same picture for both; a file is a duplicate only within one Lesson.");
});

test("A Chapter Lesson the Judge fails is repaired alone, from its own share of the draft, with its own slot in the brief", async () => {
  const cut = edits(["It has three roots [src_bbbbbbbbbb, src_aaaaaaaaaa].", ""]);
  const { generator, calls } = scriptedGenerator({ lessons: { slot1: authored(), slot2: authored() } }, "fixture/author", cut);
  const { judge, calls: judgeCalls } = scriptedJudge(PASS, "fixture/judge", UNSUPPORTED, PASS);
  const draft = await createReadingGenerator({ generator, judge }).draftChapter!(chapterInput({ ...SLOT, chapter: "The tree" }, SLOT2));
  const first = await draft.finish("slot1", []);
  assert.equal(first.repairs, 0);
  const second = await draft.finish("slot2", []);
  assert.equal(second.repairs, 1);
  assert.deepEqual(calls.map((call) => call.schemaName), ["cited_chapter", "cited_reading_repair"]);
  const revision = calls[1]!.input as { previousDraft: unknown; slot: { title: string }; chapter?: unknown };
  assert.deepEqual(revision.previousDraft, authored().sections);
  assert.equal(revision.slot.title, SLOT2.title, "The repair is briefed on its own slot, not the Chapter.");
  assert.equal(revision.chapter, undefined);
  assert.equal((second.lesson.body.sections[0]!.blocks[0]! as ProseBlock).text, "Yggdrasil is the world tree [1].");
  assert.equal(judgeCalls.length, 3);
});

test("When a Chapter Lesson's repairs run out, the fallback author rewrites that Lesson alone; the other Lesson keeps its draft", async () => {
  const { generator, calls } = scriptedGenerator({ lessons: { slot1: authored(), slot2: authored() } }, "fixture/author", TOUCH);
  const { generator: fallbackGenerator, calls: fallbackCalls } = scriptedGenerator(authored("Written afresh [src_aaaaaaaaaa]."), "fixture/fallback");
  // slot1 passes; slot2's draft and both repairs fail, which spends its budget; the fallback's fresh draft passes.
  const { judge } = scriptedJudge(PASS, "fixture/judge", UNSUPPORTED, UNSUPPORTED, UNSUPPORTED, PASS);
  const draft = await createReadingGenerator({ generator, fallbackGenerator, judge }).draftChapter!(chapterInput({ ...SLOT, chapter: "The tree" }, SLOT2));
  const first = await draft.finish("slot1", []);
  assert.deepEqual(first.authorModelIds, ["fixture/author"]);
  const second = await draft.finish("slot2", []);
  assert.deepEqual(calls.map((call) => call.schemaName), ["cited_chapter", "cited_reading_repair", "cited_reading_repair"]);
  assert.deepEqual(fallbackCalls.map((call) => call.schemaName), ["cited_reading"], "The fallback writes one Lesson, from scratch.");
  assert.deepEqual(second.authorModelIds, ["fixture/fallback"]);
  assert.equal((second.lesson.body.sections[0]!.blocks[0]! as ProseBlock).text, "Written afresh [1].");
});
