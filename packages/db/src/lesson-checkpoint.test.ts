import assert from "node:assert/strict";
import { test } from "node:test";
import { readingCodeFailures, type ReadingLessonDraft } from "./lesson-checkpoint.ts";

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
  lesson.body.sections[0]!.blocks[0]!.text = "Yggdrasil stands at the centre [1][src_ffffffffff].";
  assert.ok(readingCodeFailures(lesson, RETRIEVED).some((failure) => failure.includes("Source ID")));
});

test("Inline numbers and the source list must agree both ways", () => {
  const dangling = valid();
  dangling.body.sections[0]!.blocks[0]!.text = "Yggdrasil stands at the centre [3].";
  assert.ok(readingCodeFailures(dangling, RETRIEVED).some((failure) => failure.includes("no Source")));

  const unused = valid();
  unused.body.sections[1]!.blocks[0]!.text = "Accounts of its roots differ [1].";
  assert.ok(readingCodeFailures(unused, RETRIEVED).some((failure) => failure.includes("cited inline")));
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
