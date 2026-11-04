import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApprovedBlueprint } from "./blueprint.ts";
import type { ReadingBody } from "./reading-lesson.ts";
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
    courseRequestId: "request1", lineage: null, rejectedSources: [], judge: PASS, authorModelIds: ["fixture/author"], judgeModelId: "fixture/judge", writeTimeProfile: null,
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

test("A Reading without the visual its slot planned still publishes: a missing image is never a defect (SEN-121)", () => {
  const approved = structuredClone(APPROVED);
  approved.blueprint.modules[0]!.slots[0]!.visuals = [{ kind: "technique", intent: "Matched grip from above." }];
  const [reading, quiz] = checkpoints();
  assert.deepEqual(courseCodeFailures(approved, [reading!, quiz!]), []);
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

/** The approved Blueprint with a second Reading and a Goal Check at the end (SEN-81). */
function withGoalCheck(): { approved: ApprovedBlueprint; checkpoints: LessonCheckpoint[] } {
  const approved = structuredClone(APPROVED);
  approved.blueprint.modules.push({
    title: "Finding your way",
    slots: [
      {
        id: "slot3", method: "reading", title: "The Roots", lessonGoal: "Trace the three roots.",
        objectives: ["Trace the roots"], topicTags: ["yggdrasil"], assessesSlotIds: [],
      },
      {
        id: "slot4", method: "goal_check", title: "Goal Check", lessonGoal: "Show you can explain the Norse picture of the world.",
        objectives: ["Explain how the worlds connect", "Place a world by its root"], topicTags: ["yggdrasil"],
        assessesSlotIds: ["slot1", "slot3"],
        objectiveSlotIds: { "Explain how the worlds connect": ["slot1"], "Place a world by its root": ["slot1", "slot3"] },
      },
    ],
  });
  const [reading, quiz] = checkpoints();
  return {
    approved,
    checkpoints: [
      reading!, quiz!,
      { ...reading!, id: "cp3", slotId: "slot3", position: 2, title: "The Roots", lessonGoal: "Trace the three roots.", objectives: ["Trace the roots"] },
      {
        ...quiz!, id: "cp4", slotId: "slot4", position: 3, teachingMethod: "goal_check", title: "Goal Check",
        lessonGoal: "Show you can explain the Norse picture of the world.", objectives: ["Explain how the worlds connect", "Place a world by its root"],
      },
    ],
  };
}

test("A Goal Check commits to its goal objectives (SEN-81)", () => {
  const { checkpoints: rows } = withGoalCheck();
  assert.deepEqual(lessonCommitments(rows[3]!), ["Explain how the worlds connect", "Place a world by its root"]);
});

test("Publication maps the Goal Check's teaching slots per goal objective to published Lesson ids; other Lessons map none (SEN-81)", () => {
  const { approved, checkpoints: rows } = withGoalCheck();
  let n = 0;
  const published = publicationRows({
    learnerId: "learner1", courseRequestId: "request1", subject: "Norse mythology", learningGoal: "Explain the Norse picture of the world",
    approved, checkpoints: rows, newId: () => `id${++n}`,
  });
  const [first, quiz, roots, goalCheck] = published.lessons;
  assert.deepEqual(goalCheck!.objectiveLessonIds, { "Explain how the worlds connect": [first!.id], "Place a world by its root": [first!.id, roots!.id] });
  assert.deepEqual(goalCheck!.assessedLessonIds, [first!.id, roots!.id]);
  assert.equal(goalCheck!.teachingMethod, "goal_check");
  assert.deepEqual([first!.objectiveLessonIds, quiz!.objectiveLessonIds, roots!.objectiveLessonIds], [{}, {}, {}]);
  assert.deepEqual(courseCodeFailures(approved, rows), []);
});
