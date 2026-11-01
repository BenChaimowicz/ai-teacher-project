import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlueprintSlot } from "@senoy/db/blueprint";
import type { MediaDescriptorFields, MediaLicense } from "@senoy/db";
import type { MediaBlock, ProseBlock } from "@senoy/db/reading-lesson";
import type { PackSource, SourcePack } from "@senoy/research";
import type { Generator, Judge, StructuredRequest, ModelReply } from "./model-ports.ts";
import { rankCandidates, type MediaLibrary } from "./media-library.ts";
import { ModelError } from "./openrouter.ts";
import {
  applyRepairEdits, authoredSections, createReadingGenerator, LessonUnresearchableError, numberCitations, READING_JUDGE_CHECKS, ReadingFailedError,
  ReuseUnfitError, UNRELIABLE_SOURCE, lessonEvidence, mediaProposalOf, MEDIA_VISION_CHECKS, type ReadingInput, type ReuseSeed,
} from "./reading-generation.ts";
import { ILLUSTRATION_RULE, READING_STYLE, TEACHING_VOICE } from "./teaching-style.ts";

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

/** Scripted Generator: one output per call, repeating the last; records what it was shown and asked for. */
function scriptedGenerator(output: unknown, modelId = "fixture/author", ...later: unknown[]) {
  const outputs = [output, ...later];
  const calls: { input: unknown; schemaName: string; systemPrompt: string }[] = [];
  const generator: Generator = {
    modelId,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      calls.push({ input: request.input, schemaName: request.schemaName, systemPrompt: request.systemPrompt });
      return { value: request.parse(outputs[Math.min(calls.length, outputs.length) - 1]), modelId: modelId };
    },
  };
  return { generator, calls };
}

const PASS = { pass: true, failedChecks: [], reasons: [] };

/** One objective's grounding verdict, as the grounding call returns it. */
type Grounded = { verdict: string; text?: string; reason?: string };

/**
 * Scripted Judge: one Lesson verdict per call, repeating the last; records what it was shown and who it was told wrote
 * it. Source vetting and objective grounding calls are recorded apart: vetting rejects the Source IDs in `rejected`,
 * and grounding supports every objective unless `grounded` holds another verdict for it.
 */
function scriptedJudge(verdict: unknown = PASS, modelId = "fixture/judge", ...later: unknown[]) {
  const verdicts = [verdict, ...later];
  const calls: { input: unknown; authorModelIds: readonly string[]; schema: unknown; systemPrompt: string }[] = [];
  const vettings: { input: unknown; systemPrompt: string }[] = [];
  const groundings: { input: unknown; authorModelIds: readonly string[]; systemPrompt: string }[] = [];
  const rejected: string[] = [];
  const grounded = new Map<string, Grounded>();
  const judge: Judge = {
    modelId,
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
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
  return { judge, calls, vettings, groundings, rejected, grounded };
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
  media: null,
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

/** What the writer asks for: the plate, after the first section. */
const ASK = { section: "The tree", mediaCategory: "norse-mythic-depiction", topicTags: ["Yggdrasil"], caption: "One artist's depiction of Yggdrasil.", alt: "An engraving of an ash tree with roots and branches spreading wide." };

/** A first draft that asks for `media`. */
function asking(media: unknown = ASK) {
  return { ...authored(), media };
}

/**
 * The scripted Judge, with the vision call answered apart: each `media_fitness` call gets the next verdict, or throws
 * when the verdict is an Error. Records every vision request.
 * @param verdicts - One per vision call, repeating the last
 */
function visionJudge(...verdicts: (unknown | Error)[]) {
  const scripted = scriptedJudge();
  const vision: (StructuredRequest<unknown> & { authorModelIds: readonly string[] })[] = [];
  const judge: Judge = {
    modelId: scripted.judge.modelId,
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
      if (request.schemaName !== "media_fitness") return scripted.judge.judge(request);
      vision.push(request as StructuredRequest<unknown> & { authorModelIds: readonly string[] });
      const verdict = verdicts[Math.min(vision.length, verdicts.length) - 1] ?? PASS;
      if (verdict instanceof Error) throw verdict;
      return { value: request.parse(verdict), modelId: "fixture/vision" };
    },
  };
  return { ...scripted, judge, vision };
}

/** Every media block in a Lesson body. */
function mediaBlocks(body: { sections: { blocks: { kind: string }[] }[] }): MediaBlock[] {
  return body.sections.flatMap((section) => section.blocks).filter((block): block is MediaBlock => block.kind === "media");
}

test("A Reading's one image is looked up by category and tags, vision-judged by a non-author, and placed after its section", async () => {
  const { generator, calls } = scriptedGenerator(asking());
  const { judge, vision } = visionJudge(PASS);
  const other = plate({ id: "d0a1e001-0000-4000-8000-000000000002", storageKey: "library/norse/valhalla.jpg", topicTags: ["valhalla"] });
  const checked = await createReadingGenerator({ generator, judge, media: library([other, plate()]) }).generate(INPUT);

  const author = calls[0]!;
  assert.match(author.systemPrompt, /"mediaCatalog" lists each Media category/);
  assert.deepEqual((author.input as { mediaCatalog: unknown }).mediaCatalog, [{ mediaCategory: "norse-mythic-depiction", topicTags: ["valhalla", "yggdrasil", "world-tree"] }]);

  assert.equal(vision.length, 1);
  assert.deepEqual(vision[0]!.input, { caption: ASK.caption, alt: ASK.alt });
  assert.deepEqual(vision[0]!.images, [{ mimeType: "image/jpeg", bytes: PLATE_BYTES }]);
  assert.deepEqual(vision[0]!.authorModelIds, ["fixture/author"], "The vision Judge is never a model that wrote the Lesson.");
  assert.deepEqual((vision[0]!.schema as { properties: { failedChecks: { items: { enum: unknown } } } }).properties.failedChecks.items.enum, MEDIA_VISION_CHECKS);

  const [block, ...extra] = mediaBlocks(checked.lesson.body);
  assert.equal(extra.length, 0);
  assert.equal(checked.lesson.body.sections[0]!.blocks.at(-1), block, "The image follows the section it names.");
  assert.equal(block!.caption, ASK.caption);
  assert.equal(block!.alt, ASK.alt);
  assert.deepEqual(block!.descriptor, plate(), "The Lesson keeps every descriptor field.");
  assert.equal(checked.media.status, "attached");
  assert.deepEqual(checked.rounds[0]!.media, { ...ASK, topicTags: ["yggdrasil"] }, "Tags are read as lowercase.");
});

test("A Lesson's descriptor is a copy: editing the catalog afterwards cannot change it", async () => {
  const row = plate();
  const { generator } = scriptedGenerator(asking());
  const { judge } = visionJudge(PASS);
  const checked = await createReadingGenerator({ generator, judge, media: library([row]) }).generate(INPUT);
  row.caption = "Edited later.";
  row.topicTags.push("edited");
  row.source!.author = "Someone else";
  assert.deepEqual(mediaBlocks(checked.lesson.body)[0]!.descriptor, plate());
});

test("A catalog miss drops the image and the Lesson goes on without it, with no vision call", async () => {
  const { generator } = scriptedGenerator(asking({ ...ASK, topicTags: ["bifrost"] }));
  const { judge, vision } = visionJudge(PASS);
  const checked = await createReadingGenerator({ generator, judge, media: library([plate()]) }).generate(INPUT);
  assert.equal(vision.length, 0);
  assert.deepEqual(mediaBlocks(checked.lesson.body), []);
  assert.equal(checked.media.status, "miss");
  assert.equal(checked.judge.pass, true);
});

test("Deterministic checks skip an unhostable or unreadable file for the next match, and drop the image when none is left", async () => {
  const nonCommercial = plate({ id: "d0a1e001-0000-4000-8000-00000000000a", storageKey: "library/norse/a-nc.jpg", license: "cc_by_nc" as MediaLicense, topicTags: ["yggdrasil", "world-tree", "ash"] });
  const unreadable = plate({ id: "d0a1e001-0000-4000-8000-00000000000b", storageKey: "library/norse/b-gone.jpg" });
  const { generator } = scriptedGenerator(asking({ ...ASK, topicTags: ["yggdrasil", "ash"] }));
  const { judge, vision } = visionJudge(PASS);
  const checked = await createReadingGenerator({ generator, judge, media: library([nonCommercial, unreadable, plate()]) }).generate(INPUT);
  assert.equal(vision.length, 1);
  assert.equal(mediaBlocks(checked.lesson.body)[0]!.descriptor.id, plate().id);
  assert.ok(checked.media.status === "attached");
  assert.deepEqual(checked.media.rejected.map(({ storageKey }) => storageKey), [nonCommercial.storageKey, unreadable.storageKey]);
  assert.match(checked.media.rejected[0]!.failures.join(" "), /not one the product can host/);
  assert.match(checked.media.rejected[1]!.failures.join(" "), /No file at/);

  const { generator: again } = scriptedGenerator(asking());
  const none = visionJudge(PASS);
  const dropped = await createReadingGenerator({ generator: again, judge: none.judge, media: library([nonCommercial]) }).generate(INPUT);
  assert.equal(none.vision.length, 0, "No file passed the checks, so nothing is shown to the vision Judge.");
  assert.equal(dropped.media.status, "invalid");
  assert.deepEqual(mediaBlocks(dropped.lesson.body), []);
});

test("A vision failure or a failed vision call drops the image and keeps the Lesson as it passed", async () => {
  const { generator } = scriptedGenerator(asking());
  const failing = visionJudge({ pass: false, failedChecks: ["caption_fit"], reasons: ["The image is a painting, not a photograph."] });
  const failed = await createReadingGenerator({ generator, judge: failing.judge, media: library([plate()]) }).generate(INPUT);
  assert.equal(failed.media.status, "vision_failed");
  assert.deepEqual(mediaBlocks(failed.lesson.body), []);
  assert.equal(failed.repairs, 0, "The image spends no Lesson repair.");

  const { generator: again } = scriptedGenerator(asking());
  const erroring = visionJudge(new ModelError("timeout"));
  const errored = await createReadingGenerator({ generator: again, judge: erroring.judge, media: library([plate()]) }).generate(INPUT);
  assert.equal(errored.media.status, "vision_error");
  assert.deepEqual(mediaBlocks(errored.lesson.body), []);

  const { generator: third } = scriptedGenerator(asking());
  const broken = visionJudge(new Error("lease lost"));
  await assert.rejects(createReadingGenerator({ generator: third, judge: broken.judge, media: library([plate()]) }).generate(INPUT), /lease lost/);
});

test("Repairs keep the image the first draft asked for; a section the repairs cut takes it with it", async () => {
  const fail = { pass: false, failedChecks: ["claim_support"], reasons: ["Roots are unsupported."] };
  const { generator } = scriptedGenerator(asking(), "fixture/author", TOUCH);
  const scripted = visionJudge(PASS);
  const base = scripted.judge;
  let lessonVerdicts = 0;
  const judge: Judge = {
    modelId: base.modelId,
    async judge(request) {
      if (request.schemaName === "reading_lesson_review") return { value: request.parse(lessonVerdicts++ === 0 ? fail : PASS), modelId: "fixture/judge" };
      return base.judge(request);
    },
  };
  const repaired = await createReadingGenerator({ generator, judge, media: library([plate()]) }).generate(INPUT);
  assert.equal(repaired.repairs, 1);
  assert.equal(repaired.media.status, "attached");

  const { generator: misnamed } = scriptedGenerator(asking({ ...ASK, section: "A heading no draft has" }));
  const unplaced = visionJudge(PASS);
  const checked = await createReadingGenerator({ generator: misnamed, judge: unplaced.judge, media: library([plate()]) }).generate(INPUT);
  assert.equal(checked.media.status, "unplaced");
  assert.equal(unplaced.vision.length, 0);
});

test("A request outside the offered catalog is dropped, not a failed draft; with no library, no image is offered", async () => {
  const { generator } = scriptedGenerator(asking({ ...ASK, mediaCategory: "drum-grip" }));
  const { judge } = visionJudge(PASS);
  const checked = await createReadingGenerator({ generator, judge, media: library([plate()]) }).generate(INPUT);
  assert.equal(checked.media.status, "none");

  const { generator: plain, calls } = scriptedGenerator(authored());
  const without = await createReadingGenerator({ generator: plain, judge: scriptedJudge().judge }).generate(INPUT);
  assert.equal(without.media.status, "none");
  assert.doesNotMatch(calls[0]!.systemPrompt, /mediaCatalog/);
  assert.ok(!("mediaCatalog" in (calls[0]!.input as object)));
});

test("A reused Lesson asks this Course's catalog again for the image it had", async () => {
  const origin = await createReadingGenerator({ generator: scriptedGenerator(asking()).generator, judge: visionJudge(PASS).judge, media: library([plate()]) }).generate(INPUT);
  const proposal = mediaProposalOf(origin.lesson.body);
  assert.deepEqual(proposal, { section: "The tree", mediaCategory: "norse-mythic-depiction", topicTags: ["yggdrasil", "world-tree"], caption: ASK.caption, alt: ASK.alt });
  assert.deepEqual(authoredSections(origin.lesson.body, origin.lesson.sources), authoredSections(numberCitations(authored().sections, lessonEvidence(INPUT.packs)).body, origin.lesson.sources), "Media blocks are not prose to fit.");

  const { generator, calls } = scriptedGenerator(fitReply("verbatim"));
  const { judge, vision } = visionJudge(PASS);
  const reused = await createReadingGenerator({ generator, judge, media: library([plate()]) }).generate(reusing({ media: proposal }));
  assert.ok(!("mediaCatalog" in (calls[0]!.input as object)), "The fit pass is not offered a new image.");
  assert.equal(vision.length, 1);
  assert.equal(reused.media.status, "attached");
  assert.equal(mediaBlocks(reused.lesson.body)[0]!.descriptor.id, plate().id);
});
