import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlueprintSlot } from "@senoy/db/blueprint";
import type { PackSource, SourcePack } from "@senoy/research";
import type { Generator, Judge, StructuredRequest } from "./model-ports.ts";
import { createReadingGenerator, ReadingFailedError, type ReadingInput } from "./reading-generation.ts";

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

/** Scripted Generator: one output per call, repeating the last; records what it was shown. */
function scriptedGenerator(output: unknown, modelId = "fixture/author", ...later: unknown[]) {
  const outputs = [output, ...later];
  const calls: { input: unknown }[] = [];
  const generator: Generator = {
    modelId,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
      calls.push({ input: request.input });
      return request.parse(outputs[Math.min(calls.length, outputs.length) - 1]);
    },
  };
  return { generator, calls };
}

const PASS = { pass: true, failedChecks: [], reasons: [] };

/**
 * Scripted Judge: one Lesson verdict per call, repeating the last; records what it was shown and who it was told wrote
 * it. Source vetting calls are recorded apart and reject the Source IDs in `rejected`.
 */
function scriptedJudge(verdict: unknown = PASS, modelId = "fixture/judge", ...later: unknown[]) {
  const verdicts = [verdict, ...later];
  const calls: { input: unknown; authorModelId: string }[] = [];
  const vettings: { input: unknown }[] = [];
  const rejected: string[] = [];
  const judge: Judge = {
    modelId,
    async judge<T>(request: StructuredRequest<T> & { authorModelId: string }): Promise<T> {
      if (request.schemaName === "source_vetting") {
        vettings.push({ input: request.input });
        return request.parse({ rejected: rejected.map((sourceId) => ({ sourceId, reason: "A shop's blog." })) });
      }
      calls.push({ input: request.input, authorModelId: request.authorModelId });
      return request.parse(verdicts[Math.min(calls.length, verdicts.length) - 1]);
    },
  };
  return { judge, calls, vettings, rejected };
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
  assert.equal(lesson.body.sections[0]!.blocks[0]!.text, "Yggdrasil is the world tree [1]. It has three roots [2][1].");
  assert.equal(lesson.body.sections[1]!.blocks[0]!.text, "Roots again [2].");
  assert.deepEqual(lesson.citations, [
    { n: 1, title: WIKI.title, url: WIKI.url },
    { n: 2, title: BRIT.title, url: BRIT.url },
  ]);
  assert.deepEqual(lesson.sources.map(({ n, sourceId, publisher, usedAs }) => ({ n, sourceId, publisher, usedAs })), [
    { n: 1, sourceId: WIKI.sourceId, publisher: "en.wikipedia.org", usedAs: "paraphrase" },
    { n: 2, sourceId: BRIT.sourceId, publisher: "www.britannica.com", usedAs: "paraphrase" },
  ]);
  assert.equal(calls[0]!.authorModelId, "fixture/author");
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

test("A Judge failure is repaired once: the author sees its draft, the numbering, and the reasons", async () => {
  const { generator, calls } = scriptedGenerator(authored(), "fixture/author", authored("Yggdrasil is the world tree [src_aaaaaaaaaa]."));
  const { judge, calls: judgeCalls } = scriptedJudge(UNSUPPORTED, "fixture/judge", PASS);
  const { lesson, repairs } = await createReadingGenerator({ generator, judge }).generate(INPUT);

  assert.equal(repairs, 1);
  assert.equal(judgeCalls.length, 2);
  assert.equal(lesson.body.sections[0]!.blocks[0]!.text, "Yggdrasil is the world tree [1].");
  assert.equal((calls[0]!.input as { revision?: unknown }).revision, undefined);
  const { revision } = calls[1]!.input as { revision: { previousDraft: unknown; numberedSources: unknown; problems: string[] } };
  assert.deepEqual(revision.previousDraft, authored().sections);
  assert.deepEqual(revision.numberedSources, [{ n: 1, sourceId: WIKI.sourceId }, { n: 2, sourceId: BRIT.sourceId }]);
  assert.deepEqual(revision.problems, UNSUPPORTED.reasons);
});

test("A Citation to a Source ID outside the packs fails the Code checks, is repaired, and never reaches the Judge", async () => {
  const { generator, calls } = scriptedGenerator(authored("Yggdrasil is the world tree [src_aaaaaaaaaa, src_dddddddddd]."));
  const { judge, calls: judgeCalls } = scriptedJudge();
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), (error: unknown) =>
    error instanceof ReadingFailedError && error.codeFailures.some((failure) => failure.includes("Source ID")) && error.lesson !== null);
  assert.equal(calls.length, 2, "One initial attempt and one repair.");
  assert.ok((calls[1]!.input as { revision: { problems: string[] } }).revision.problems.some((problem) => problem.includes("Source ID")));
  assert.equal(judgeCalls.length, 0);
});

test("A Lesson the Judge fails again after its repair fails, whatever pass says", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge } = scriptedJudge({ pass: true, failedChecks: ["claim_support", "claim_support"], reasons: ["Unsupported root count."] });
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), (error: unknown) =>
    error instanceof ReadingFailedError && error.codeFailures.length === 0 && error.judge?.failedChecks.join() === "claim_support");
  assert.equal(calls.length, 2);
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
  const { generator } = scriptedGenerator(authored());
  const { judge, rejected } = scriptedJudge();
  rejected.push(BRIT.sourceId);
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), (error: unknown) =>
    error instanceof ReadingFailedError && error.codeFailures.some((failure) => failure.includes("Source ID")) &&
    error.rejectedSources.length === 1);
});

test("A Citation to a shop or marketing page is a Judge failure", async () => {
  const { generator } = scriptedGenerator(authored());
  const { judge } = scriptedJudge({ pass: false, failedChecks: ["unreliable_source"], reasons: ["[2] is an engraving shop's blog."] });
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), (error: unknown) =>
    error instanceof ReadingFailedError && error.judge?.failedChecks.join() === "unreliable_source");
});

test("Packs with no excerpts fail before any model call", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge } = scriptedJudge();
  await assert.rejects(createReadingGenerator({ generator, judge }).generate({ ...INPUT, packs: [pack("primary", [EMPTY])] }),
    ReadingFailedError);
  assert.equal(calls.length, 0);
});

test("The author never judges its own Lesson", async () => {
  const { generator, calls } = scriptedGenerator(authored(), "same/model");
  const { judge } = scriptedJudge(undefined, "same/model");
  await assert.rejects(createReadingGenerator({ generator, judge }).generate(INPUT), /different model/);
  assert.equal(calls.length, 0);
});
