import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlueprintSlot } from "./blueprint.ts";
import { quizCodeFailures, readingCodeFailures, type QuizLessonDraft, type ReadingLessonDraft } from "./lesson-checkpoint.ts";
import type { MediaDescriptorFields, MediaLicense } from "./media.ts";
import type { MediaBlock } from "./reading-lesson.ts";

const RETRIEVED = new Set(["https://en.wikipedia.org/w/index.php?oldid=1", "https://www.britannica.com/topic/Yggdrasil"]);

/** A reading Lesson citing both retrieved Sources. */
function valid(): ReadingLessonDraft {
  return {
    slotId: "slot1",
    teachingMethod: "reading",
    title: "The World Tree",
    lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.",
    objectives: ["Name the Nine Worlds"],
    topicTags: ["yggdrasil", "nine-worlds"],
    lineage: null,
    body: {
      sections: [
        { heading: "A tree at the centre", blocks: [{ kind: "prose", text: "Yggdrasil stands at the centre [1]." }] },
        { heading: "Its roots", blocks: [{ kind: "prose", text: "Accounts of its roots differ [1][2]." }] },
      ],
    },
    citations: [
      { n: 1, title: "Yggdrasil", url: "https://en.wikipedia.org/w/index.php?oldid=1" },
      { n: 2, title: "Yggdrasil | Britannica", url: "https://www.britannica.com/topic/Yggdrasil" },
    ],
    sources: [
      { n: 1, sourceId: "src_0000000001", title: "Yggdrasil", url: "https://en.wikipedia.org/w/index.php?oldid=1", publisher: "en.wikipedia.org", retrievedAt: "2026-10-08T17:41:57.034Z", usedAs: "paraphrase" },
      { n: 2, sourceId: "src_0000000002", title: "Yggdrasil | Britannica", url: "https://www.britannica.com/topic/Yggdrasil", publisher: "britannica.com", retrievedAt: "2026-10-08T17:41:57.034Z", usedAs: "paraphrase" },
    ],
  };
}

test("A cited reading Lesson inside its retrieval set passes the Code checks", () => {
  assert.deepEqual(readingCodeFailures(valid(), RETRIEVED), []);
});

test("A Citation URL outside the retrieval set fails", () => {
  const failures = readingCodeFailures(valid(), new Set(["https://en.wikipedia.org/w/index.php?oldid=1"]));
  assert.ok(failures.some((failure) => failure.includes("britannica.com")), failures.join("\n"));
});

test("An unresolved Source ID marker fails as a Citation to an unknown Source", () => {
  const lesson = valid();
  lesson.body.sections[0]!.blocks[0] = { kind: "prose", text: "Yggdrasil stands at the centre [1][src_ffffffffff]." };
  assert.ok(readingCodeFailures(lesson, RETRIEVED).some((failure) => failure.includes("Source ID")));
});

test("Inline numbers and the source list must agree both ways", () => {
  const dangling = valid();
  dangling.body.sections[0]!.blocks[0] = { kind: "prose", text: "Yggdrasil stands at the centre [3]." };
  assert.ok(readingCodeFailures(dangling, RETRIEVED).some((failure) => failure.includes("no Source")));

  const unused = valid();
  unused.body.sections[1]!.blocks[0] = { kind: "prose", text: "Accounts of its roots differ [1]." };
  assert.ok(readingCodeFailures(unused, RETRIEVED).some((failure) => failure.includes("cited inline")));
});

/** A public-domain Norse plate, attached with the writer's caption and alt. */
function mediaBlock(overrides: Partial<MediaDescriptorFields> = {}): MediaBlock {
  return {
    kind: "media",
    caption: "One artist's depiction of Yggdrasil.",
    alt: "An engraving of a great ash tree whose roots reach three wells.",
    descriptor: {
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
      byteSize: 120_000,
      sha256: "a".repeat(64),
      width: 800,
      height: 1000,
      mediaCategory: "norse-mythic-depiction",
      topicTags: ["yggdrasil"],
      ...overrides,
    },
  };
}

test("A Reading with one hostable raster media block passes the Code checks", () => {
  const lesson = valid();
  lesson.body.sections[0]!.blocks.push(mediaBlock());
  assert.deepEqual(readingCodeFailures(lesson, RETRIEVED), []);
});

test("A media block with an unhostable licence, an SVG file, or no alt text fails", () => {
  const nonCommercial = valid();
  nonCommercial.body.sections[0]!.blocks.push(mediaBlock({ license: "cc_by_nc" as MediaLicense }));
  assert.ok(readingCodeFailures(nonCommercial, RETRIEVED).some((failure) => failure.includes("the product can host")));

  const svg = valid();
  svg.body.sections[0]!.blocks.push(mediaBlock({ mimeType: "image/svg+xml" }));
  assert.ok(readingCodeFailures(svg, RETRIEVED).some((failure) => failure.includes("image/svg+xml")));

  const noAlt = valid();
  noAlt.body.sections[0]!.blocks.push({ ...mediaBlock(), alt: " " });
  assert.ok(readingCodeFailures(noAlt, RETRIEVED).some((failure) => failure.includes("alt text")));
});

test("A Reading carries at most one media block, and no section is media alone", () => {
  const two = valid();
  two.body.sections[0]!.blocks.push(mediaBlock());
  two.body.sections[1]!.blocks.push(mediaBlock());
  assert.ok(readingCodeFailures(two, RETRIEVED).some((failure) => failure.includes("at most 1")));

  const alone = valid();
  alone.body.sections.push({ heading: "A picture", blocks: [mediaBlock()] });
  assert.ok(readingCodeFailures(alone, RETRIEVED).some((failure) => failure.includes("only media")));
});

test("A Lesson with no Citations, no sections, or an empty envelope fails", () => {
  const uncited = { ...valid(), citations: [], sources: [] };
  uncited.body = { sections: [{ heading: "A tree", blocks: [{ kind: "prose", text: "Yggdrasil stands at the centre." }] }] };
  assert.ok(readingCodeFailures(uncited, RETRIEVED).some((failure) => failure.includes("at least one Source")));

  const empty = { ...valid(), title: " ", objectives: [], body: { sections: [] } };
  const failures = readingCodeFailures(empty, RETRIEVED);
  assert.ok(failures.some((failure) => failure.includes("title")));
  assert.ok(failures.some((failure) => failure.includes("objectives")));
  assert.ok(failures.some((failure) => failure.includes("reading section")));
});

test("The stored source list must match the numbered Citations, and a quote must carry its text", () => {
  const mismatched = valid();
  mismatched.sources[1] = { ...mismatched.sources[1]!, url: "https://example.com/other" };
  assert.ok(readingCodeFailures(mismatched, RETRIEVED).some((failure) => failure.includes("source list")));

  const quoted = valid();
  quoted.sources[0] = { ...quoted.sources[0]!, usedAs: "quote" };
  assert.ok(readingCodeFailures(quoted, RETRIEVED).some((failure) => failure.includes("quoted text")));
});

const READING_SLOT: BlueprintSlot = {
  id: "slot1", method: "reading", title: "The World Tree", lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.",
  objectives: ["Name the Nine Worlds"], topicTags: ["yggdrasil", "nine-worlds"], assessesSlotIds: [],
};
const QUIZ_SLOT: BlueprintSlot = {
  id: "slot2", method: "quiz", title: "Check: the World Tree", lessonGoal: "Recall how Yggdrasil connects the worlds.",
  objectives: ["Name the Nine Worlds"], topicTags: ["yggdrasil", "quiz"], assessesSlotIds: ["slot1"],
};
const SLOTS = [READING_SLOT, QUIZ_SLOT];
const CHECKPOINTED = new Set(["slot1"]);

/** A five-item Quiz assessing the checkpointed Reading. */
function quiz(): QuizLessonDraft {
  return {
    slotId: "slot2", teachingMethod: "quiz", title: QUIZ_SLOT.title, lessonGoal: QUIZ_SLOT.lessonGoal,
    objectives: QUIZ_SLOT.objectives, topicTags: QUIZ_SLOT.topicTags, lineage: null, sources: [], citations: [],
    body: {
      items: [1, 2, 3, 4, 5].map((n) => ({
        id: `item${n}`,
        prompt: `Question ${n}?`,
        options: ["a", "b", "c", "d"].map((id) => ({ id, text: `Option ${id} of ${n}` })),
        correctOptionId: "b",
        explanations: { brief: "Brief.", standard: "Standard.", detailed: "Detailed." },
      })),
    },
  };
}

test("A five-item, four-option Quiz on a checkpointed preceding Reading passes the Code checks", () => {
  assert.deepEqual(quizCodeFailures(quiz(), SLOTS, CHECKPOINTED), []);
});

test("A Quiz outside 5–10 items, or an item without four options and one key, fails", () => {
  const short = quiz();
  short.body.items.pop();
  assert.ok(quizCodeFailures(short, SLOTS, CHECKPOINTED).some((failure) => failure.includes("not 4")));

  const broken = quiz();
  broken.body.items[0]!.options.pop();
  broken.body.items[1]!.correctOptionId = "z";
  broken.body.items[2]!.options[1]!.text = broken.body.items[2]!.options[0]!.text;
  const failures = quizCodeFailures(broken, SLOTS, CHECKPOINTED);
  assert.ok(failures.includes("Item 1 needs exactly 4 options."), failures.join("\n"));
  assert.ok(failures.includes("Item 2 needs exactly one correct option."), failures.join("\n"));
  assert.ok(failures.includes("Item 3 needs 4 different, non-empty options."), failures.join("\n"));

  const placeholder = quiz();
  placeholder.body.items[0]!.options[2]!.text = "Option 3";
  assert.deepEqual(quizCodeFailures(placeholder, SLOTS, CHECKPOINTED), ["Item 1 has a placeholder instead of an option."]);

  const lettered = quiz();
  lettered.body.items[0]!.explanations.detailed = "Option A reverses the order.";
  lettered.body.items[1]!.explanations.brief = "Answer B is a trap, as is (c).";
  lettered.body.items[2]!.explanations.standard = "The first option is wrong because the Lesson says so.";
  lettered.body.items[3]!.explanations.detailed = "It is the ash; the third is wrong because it names Hel.";
  assert.deepEqual(quizCodeFailures(lettered, SLOTS, CHECKPOINTED).map((failure) => failure.slice(0, 26)), [
    "Item 1's explanation names", "Item 2's explanation names", "Item 3's explanation names", "Item 4's explanation names",
  ]);
  const prose = quiz();
  prose.body.items[0]!.explanations.detailed = "Answer Asgard looks close, but the answer a careful reader picks is the ash. The first root runs under Hel.";
  assert.deepEqual(quizCodeFailures(prose, SLOTS, CHECKPOINTED), [], "Ordinary prose is not a letter reference.");
});

test("A Quiz with reading sections, media, Sources, or lineage fails", () => {
  const lesson = quiz();
  Object.assign(lesson.body, { sections: [] });
  Object.assign(lesson.body.items[0]!, { media: { kind: "image" } });
  Object.assign(lesson, { lineage: { originLessonId: "x" }, citations: [{ n: 1, title: "t", url: "https://example.org" }] });
  const failures = quizCodeFailures(lesson, SLOTS, CHECKPOINTED);
  assert.ok(failures.includes("A Quiz has no reading sections or Demonstrative media."), failures.join("\n"));
  assert.ok(failures.some((failure) => failure.startsWith("Item 1 carries")), failures.join("\n"));
  assert.ok(failures.includes("A Quiz is always generated, never reused."), failures.join("\n"));
  assert.ok(failures.includes("A Quiz carries no Sources or Citations of its own."), failures.join("\n"));
});

test("A Quiz fails when an assessed slot is missing, not a Reading, later, or not checkpointed", () => {
  assert.deepEqual(quizCodeFailures(quiz(), SLOTS, new Set()), ["Assessed slot slot1 has no checkpointed Lesson."]);
  assert.deepEqual(quizCodeFailures(quiz(), [QUIZ_SLOT, READING_SLOT], CHECKPOINTED), ["Assessed slot slot1 does not precede the Quiz."]);
  assert.deepEqual(quizCodeFailures(quiz(), [{ ...READING_SLOT, method: "quiz" }, QUIZ_SLOT], CHECKPOINTED), ["Assessed slot slot1 is not a Reading."]);
  assert.deepEqual(quizCodeFailures(quiz(), [QUIZ_SLOT], CHECKPOINTED), ["Assessed slot slot1 is not in the Blueprint."]);
});
