import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApprovedBlueprint } from "./blueprint.ts";
import { courseCodeFailures, lessonCommitments, publicationRows, type LessonCheckpoint } from "./publication.ts";

const APPROVED: ApprovedBlueprint = {
  sequenceMode: "free_jump",
  approvedAt: "2026-10-18T10:00:00.000Z",
  blueprint: {
    courseTitle: "Norse cosmology",
    modules: [{
      title: "The world tree",
      slots: [
        {
          id: "slot1", method: "reading", title: "The World Tree", lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.",
          objectives: ["Describe Yggdrasil"], topicTags: ["yggdrasil", "nine-worlds"], assessesSlotIds: [],
        },
        {
          id: "slot2", method: "quiz", title: "Check: the World Tree", lessonGoal: "Recall how Yggdrasil connects the worlds.",
          objectives: ["Describe Yggdrasil"], topicTags: ["yggdrasil", "quiz"], assessesSlotIds: ["slot1"],
        },
      ],
    }],
  },
};

const PASS = { pass: true, failedChecks: [], reasons: [] };

/** One checkpoint per approved slot, both passing. */
function checkpoints(): LessonCheckpoint[] {
  const base = {
    courseRequestId: "request1", lineage: null, rejectedSources: [], judge: PASS, authorModelIds: ["fixture/author"], judgeModelId: "fixture/judge",
    finalizedAt: new Date(),
  };
  return [
    {
      ...base, id: "cp1", slotId: "slot1", position: 0, teachingMethod: "reading", title: "The World Tree",
      lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.", objectives: ["Describe Yggdrasil"], topicTags: ["yggdrasil", "nine-worlds"],
      body: { sections: [{ heading: "A tree at the centre", blocks: [{ kind: "prose", text: "Yggdrasil [1]." }] }, { heading: "Its roots", blocks: [{ kind: "prose", text: "Roots [1]." }] }] },
      citations: [{ n: 1, title: "Yggdrasil", url: "https://en.wikipedia.org/w/index.php?oldid=1" }],
      sources: [{ n: 1, sourceId: "src_0000000001", title: "Yggdrasil", url: "https://en.wikipedia.org/w/index.php?oldid=1", publisher: "en.wikipedia.org", retrievedAt: "2026-10-08T17:41:57.034Z", usedAs: "paraphrase" }],
    },
    {
      ...base, id: "cp2", slotId: "slot2", position: 1, teachingMethod: "quiz", title: "Check: the World Tree",
      lessonGoal: "Recall how Yggdrasil connects the worlds.", objectives: ["Describe Yggdrasil"], topicTags: ["yggdrasil", "quiz"],
      body: { items: [] }, citations: [], sources: [],
    },
  ];
}

test("A Course whose every slot has one passing checkpoint passes the whole-Course Code checks", () => {
  assert.deepEqual(courseCodeFailures(APPROVED, checkpoints()), []);
});

test("A missing, failed, misplaced, or off-Blueprint checkpoint fails the whole-Course Code checks", () => {
  const [reading, quiz] = checkpoints();
  assert.match(courseCodeFailures(APPROVED, [reading!]).join(" "), /slot2 has 0 checkpoints/);
  assert.match(courseCodeFailures(APPROVED, [reading!, { ...quiz!, judge: { pass: false, failedChecks: ["x"], reasons: [] } }]).join(" "), /did not pass its Judge/);
  assert.match(courseCodeFailures(APPROVED, [reading!, { ...quiz!, teachingMethod: "reading" }]).join(" "), /is a quiz but its checkpoint is a reading/);
  assert.match(courseCodeFailures(APPROVED, [reading!, { ...quiz!, position: 4 }]).join(" "), /at position 1 but its checkpoint is at 4/);
  assert.match(courseCodeFailures(APPROVED, [reading!, quiz!, { ...quiz!, id: "cp3", slotId: "slot9" }]).join(" "), /slot9 is not on the approved Blueprint/);
});

test("A Reading commits to its section headings and a Quiz to its objectives", () => {
  const [reading, quiz] = checkpoints();
  assert.deepEqual(lessonCommitments(reading!), ["A tree at the centre", "Its roots"]);
  assert.deepEqual(lessonCommitments(quiz!), ["Describe Yggdrasil"]);
});

test("Publication copies the Blueprint's Modules and each checkpoint, and points the Quiz at the published Reading", () => {
  let n = 0;
  const rows = publicationRows({
    learnerId: "learner1", courseRequestId: "request1", subject: "Norse mythology", learningGoal: "Explain the Norse picture of the world",
    approved: APPROVED, checkpoints: checkpoints(), newId: () => `id${++n}`,
  });

  assert.deepEqual(rows.course, {
    id: "id1", learnerId: "learner1", courseRequestId: "request1", title: "Norse cosmology", subject: "Norse mythology",
    learningGoal: "Explain the Norse picture of the world", sequenceMode: "free_jump",
  });
  assert.deepEqual(rows.modules, [{ id: "id4", publishedCourseId: "id1", title: "The world tree", position: 0 }]);
  const [reading, quiz] = rows.lessons;
  assert.deepEqual([reading!.id, reading!.moduleId, reading!.position, reading!.teachingMethod], ["id2", "id4", 0, "reading"]);
  assert.deepEqual([quiz!.id, quiz!.position, quiz!.teachingMethod, quiz!.assessedLessonIds], ["id3", 1, "quiz", ["id2"]]);
  assert.deepEqual(reading!.citations, checkpoints()[0]!.citations);
  assert.deepEqual(reading!.body, checkpoints()[0]!.body);
});
