import { and, desc, eq } from "drizzle-orm";
import { blueprintSlots, type ApprovedBlueprint, type BlueprintSlot, type JudgeResult } from "@senoy/db/blueprint";
import type { GoalScope } from "@senoy/db/course-request";
import {
  courseBlueprints,
  courseCodeFailures,
  courseRequests,
  learners,
  lessonResearch,
  publicationRows,
  publishedCourses,
  publishedLessons,
  publishedModules,
  resolveTeachingProfile,
  startingLevelDiagnostics,
  unpublishedLessons,
  type Database,
  type ReadingBody,
  type ResolvedTeachingProfile,
  type Transaction,
} from "@senoy/db";
import { researchAdaptersFromEnv, runResearch, type SourcePack } from "@senoy/research";
import { quizPlugin } from "../teaching-methods/quiz.ts";
import { readingPlugin } from "../teaching-methods/reading.ts";
import type { TeachingMethodPlugin } from "../teaching-methods/types.ts";
import { courseOutline, createCourseJudge, type CourseJudge } from "./course-judge.ts";
import { enqueueJob, LeaseLostError, type GenerationControl, type SettledStatus, type WorkerIdentity } from "./generation-job.ts";
import { loadModelConfig } from "./model-config.ts";
import { createQuizGenerator, QuizFailedError, type CheckedQuiz, type QuizGenerator } from "./quiz-generation.ts";
import {
  createReadingGenerator,
  lessonEvidence,
  LessonUnresearchableError,
  ReadingFailedError,
  type CheckedReading,
  type PriorLesson,
  type ReadingGenerator,
} from "./reading-generation.ts";
import { trackResearchRun, withPipelineEvent, type PipelineEventScope } from "./usage-tracking.ts";

/** What one run of a claimed generation job receives. */
export type GenerationStart = {
  db: Database;
  courseRequestId: string;
  learnerId: string;
  approved: ApprovedBlueprint;
  control: GenerationControl;
  /** The worker running the job, recorded on the `course_generation` Pipeline Event. */
  worker?: WorkerIdentity;
};

/** Full-Course generation for an approved Blueprint, through atomic publish; the worker runs it as a durable job (spec §5.1). */
export interface CourseGeneration {
  start(input: GenerationStart): Promise<void>;
}

/** Primary and Secondary research for one Lesson topic. */
export type LessonResearch = (topic: string) => Promise<SourcePack[]>;

/** Injectable research, Generators, and whole-Course Judge; omitted ones are created lazily from the environment. */
export type CourseGenerationOptions = {
  research?: LessonResearch;
  readingGenerator?: ReadingGenerator;
  quizGenerator?: QuizGenerator;
  courseJudge?: CourseJudge;
};

/** The assembled Course failed the whole-Course checks (spec §6.5); nothing was published. */
export class CourseFailedError extends Error {
  /**
   * @param codeFailures - Whole-Course Code check problems; empty when only the Judge failed
   * @param judge - Whole-Course Judge verdict, when the Judge ran
   */
  constructor(public readonly codeFailures: string[], public readonly judge: JudgeResult | null) {
    const reasons = codeFailures.length ? codeFailures : [...(judge?.failedChecks ?? []), ...(judge?.reasons ?? [])];
    super(`[course-generation: publish] Course failed whole-Course ${codeFailures.length ? "Code" : "Judge"} checks || ${reasons.join(" || ")}`);
    this.name = "CourseFailedError";
  }

  /** The Judge named the sequence, not a Lesson: only a new Blueprint can fix it (spec §6.5), never Retry. */
  get needsNewBlueprint(): boolean {
    return this.judge?.failedChecks.includes("sequence_reaches_goal") ?? false;
  }
}

/** Where generation stopped, so its failure can be told in plain language. */
type Stage = { kind: "research" } | { kind: "lesson"; title: string } | { kind: "course" };

/**
 * The clause promising back the Lessons a Retry keeps, or nothing at all when none were checkpointed: the first Lesson
 * failing keeps no Lessons, so the failure must not say it does (SEN-95).
 * @param written - How many Lessons are checkpointed for the Course Request
 */
function keptClause(written: number): string {
  if (written === 0) return "";
  return `, keeping the ${written === 1 ? "Lesson" : `${written} Lessons`} already written`;
}

/** What the Learner can do after an interruption: for a transient failure, Retry is Resume (spec §5.1). */
const RESUME_STEP = "Retry continues from the next unfinished Lesson.";

/**
 * Whether generation stopped on a failed check rather than an interruption (a provider error, timeout, or crash).
 * Both are retried; a failed check is terminal until the Learner does (spec §5.1).
 * @param error - What stopped generation
 */
export function failedCheck(error: unknown): boolean {
  return error instanceof ReadingFailedError || error instanceof QuizFailedError || error instanceof CourseFailedError ||
    error instanceof LessonUnresearchableError;
}

/**
 * The Learner-facing reason generation stopped. A failed check is said plainly; anything else is an interruption.
 * @param stage - Where generation stopped
 * @param error - What stopped it
 * @param written - How many Lessons are checkpointed, so a Retry only promises back Lessons there are (SEN-95)
 */
export function failureReason(stage: Stage, error: unknown, written: number): string {
  if (stage.kind === "research") return `Generation was interrupted while researching your Lessons. ${RESUME_STEP}`;
  if (stage.kind === "lesson") {
    if (error instanceof LessonUnresearchableError) {
      return `We couldn't find reliable Sources for the Lesson “${stage.title}”. Retry searches for it again${keptClause(written)}.`;
    }
    const retryStep = written === 0 ? "Retry tries that Lesson again." : `Retry tries again from there${keptClause(written)}.`;
    return failedCheck(error)
      ? `We couldn't write the Lesson “${stage.title}” so that it passed our quality checks. ${retryStep}`
      : `Generation was interrupted while writing the Lesson “${stage.title}”. ${RESUME_STEP}`;
  }
  if (error instanceof CourseFailedError && error.needsNewBlueprint) {
    return "Together, the finished Lessons don't reach your Learning Goal, so this Course can't be published, and writing them again wouldn't change that — the plan has to change. We're planning it again now; the lessons written under the old plan are gone.";
  }
  return failedCheck(error)
    ? `The finished Lessons didn't fit together well enough to publish as one Course. Retry checks them again.`
    : `Generation was interrupted while publishing your Course. ${RESUME_STEP}`;
}

/**
 * How the job ends when generation stops: a sequence that misses the goal is final, a failed check waits for Retry, and
 * anything else is an interruption that Retry resumes.
 * @param error - What stopped generation
 */
export function settledStatus(error: unknown): SettledStatus {
  if (error instanceof CourseFailedError && error.needsNewBlueprint) return "needs_new_blueprint";
  return failedCheck(error) ? "failed" : "interrupted";
}

/**
 * The research topic for one slot: research is scoped per Lesson (spec §5.2). With a Learner-confirmed scope (SEN-90),
 * a short clause names its in- and out-of-scope facets so vendors search inside it; without one, the topic is unchanged.
 * @param subject - The Course Request subject
 * @param slot - The Blueprint slot
 * @param scope - The Learner-confirmed focus of the Learning Goal, or null (SEN-90)
 */
export function lessonResearchTopic(subject: string, slot: BlueprintSlot, scope: GoalScope | null): string {
  const topic = `${slot.title} (${subject}). ${slot.lessonGoal} Covers: ${slot.objectives.join("; ")}.`;
  const focus = scope?.inScope.length ? ` Focus: ${scope.inScope.join("; ")}.` : "";
  const not = scope?.outOfScope.length ? ` Not: ${scope.outOfScope.join("; ")}.` : "";
  return `${topic}${focus}${not}`;
}

/**
 * The queries one Reading slot is searched with, in order, until something usable comes back: an empty Source pack
 * means hard to research, so it is retried with broader queries before the Course can fail for it (spec §5.9, SEN-85).
 * Broadening is by deletion, not rephrasing: the scoped topic, then the same topic without its objective list and
 * out-of-scope clause, then the bare title and subject. No model writes these, so a re-search costs only vendor calls.
 * @param subject - The Course Request subject
 * @param slot - The Blueprint slot
 * @param scope - The Learner-confirmed focus of the Learning Goal, or null (SEN-90)
 */
export function researchQueries(subject: string, slot: BlueprintSlot, scope: GoalScope | null): string[] {
  const focus = scope?.inScope.length ? ` Focus: ${scope.inScope.join("; ")}.` : "";
  return [
    lessonResearchTopic(subject, slot, scope),
    `${slot.title} (${subject}). ${slot.lessonGoal}${focus}`,
    `${slot.title} (${subject})`,
  ];
}

/** A vendor that timed out or failed said nothing about the topic: not evidence that it is hard to research (spec §5.9). */
function unfinished(pack: SourcePack): boolean {
  return pack.status === "timed_out" || pack.status === "error";
}

/** How the search for one Reading's evidence ended. */
export type SlotSearch = {
  /** Packs of the last query tried: the one that found evidence, or the one the search gave up on. */
  packs: SourcePack[];
  /** Queries tried, in order. */
  queries: string[];
  /** True when a vendor never answered, so there is nothing to conclude about the topic and Retry should search again. */
  interrupted: boolean;
};

/**
 * Searches one Reading's topic with broader queries until a pack has something to cite (spec §5.9). Stops early when
 * a vendor times out or fails: a call that never answered says nothing about how researchable the topic is, so
 * broadening the query would be answering the wrong question, and the Course is interrupted rather than failed.
 * @param research - The research call
 * @param queries - The queries to try, broadest last
 */
export async function searchForEvidence(research: LessonResearch, queries: string[]): Promise<SlotSearch> {
  let packs: SourcePack[] = [];
  for (const [attempt, query] of queries.entries()) {
    packs = await research(query);
    const tried = queries.slice(0, attempt + 1);
    if (lessonEvidence(packs).size > 0) return { packs, queries: tried, interrupted: false };
    if (packs.some(unfinished)) return { packs, queries: tried, interrupted: true };
  }
  return { packs, queries, interrupted: false };
}

/**
 * Only the write-time Teaching Profile values a plugin declared (spec §5.5).
 * @param plugin - The slot's Teaching-method plugin
 * @param profile - The Learner's resolved Teaching Profile
 */
export function writeTimeProfile(plugin: TeachingMethodPlugin, profile: ResolvedTeachingProfile): Record<string, unknown> {
  return Object.fromEntries(plugin.writeTimeFields.map((field) => [field, profile[field].value]));
}

/** Research run against both vendors with keys from the environment; each vendor call becomes a Usage Record,
 * measured against the vendor balance when the meter is on. */
const researchFromEnv: LessonResearch = (topic) =>
  runResearch(topic, { ...researchAdaptersFromEnv(process.env), env: process.env, ...trackResearchRun() });

/**
 * Researches every Reading slot at once and stores each slot's Source packs as it finishes, so one slow research call
 * no longer delays every Reading in turn. Then writes each Lesson in Blueprint order, carrying earlier Readings forward:
 * a Reading from its stored packs, a Quiz from its checkpointed Readings (spec §5.2.4), saving each as an unpublished
 * checkpoint. Then the whole-Course Code checks and one Judge pass over the outline (spec §6.5), and atomic publish:
 * the Course snapshot, the `published` status, and the job's success in one transaction.
 *
 * A slot that already has stored research is not researched again, and one that has a checkpoint is not generated
 * again, so a resumed or reclaimed job continues from the next unfinished Lesson; earlier Readings reach later ones
 * from their checkpoints. Every write first proves the run still holds its job, so after Cancel or a lapsed lease the
 * run stops at its next stage and saves nothing.
 *
 * Any failure publishes nothing and keeps the checkpoints. A failed check fails the job and an interruption leaves it
 * `interrupted`; either moves the Request to `generation_failed` with a plain-language reason, and Retry queues the
 * job again (spec §5.1). Packs with nothing to cite are never stored, and vetting that empties a Reading's evidence
 * discards its stored packs, so either way Retry searches for that Reading again.
 * Targeted repair of a Lesson the whole-Course Judge names is not built; Retry judges the Course again.
 *
 * A sequence that misses the goal is the one failure Retry cannot help, so the run makes the structural return itself
 * (spec §5.1, SEN-85): the job ends `needs_new_blueprint`, every unpublished Lesson and stored pack of the failed plan
 * is discarded, the approved snapshot is cleared with the Judge's reasons left on the draft, and the Request goes to
 * `blueprint_preparing` with a queued Blueprint job — so the Learner comes back to a new plan to review, not a dead end.
 * @param options - Injected research, Generators, and Judge; tests pass fixtures
 */
export function createCourseGeneration(options: CourseGenerationOptions = {}): CourseGeneration {
  return {
    start({ db, courseRequestId, learnerId, approved, control, worker }) {
      return withPipelineEvent("course_generation", {
        label: approved.blueprint.courseTitle, courseRequestId, learnerId, detail: worker ? { worker } : undefined,
      }, (event) => run({ db, courseRequestId, learnerId, approved, control }, event));
    },
  };

  /**
   * One run of the job, inside its `course_generation` Pipeline Event.
   * @param input - The claimed job
   * @param event - The run's Pipeline Event, for its detail
   */
  async function run({ db, courseRequestId, learnerId, approved, control }: GenerationStart, event: PipelineEventScope): Promise<void> {
    let stage: Stage = { kind: "course" };
    try {
      const [request] = await db.select().from(courseRequests).where(eq(courseRequests.id, courseRequestId)).limit(1);
      const [learner] = await db.select().from(learners).where(eq(learners.id, learnerId)).limit(1);
      if (!request || !learner?.teachingProfileAnswers) {
        throw new Error(`[course-generation: start] Request or Teaching Profile is missing || requestId=${courseRequestId}`);
      }
      const resolved = resolveTeachingProfile(learner.teachingProfileAnswers);
      const profile = writeTimeProfile(readingPlugin, resolved);
      const research = options.research ?? researchFromEnv;
      const generator = options.readingGenerator ?? createReadingGenerator();
      const priorLessons: PriorLesson[] = [];
      /** Runs one write only while this run still holds the job. */
      const holding = (write: (transaction: Transaction) => Promise<unknown>) => db.transaction(async (transaction) => {
        await control.hold(transaction);
        await write(transaction);
      });
      const finished = await db.select().from(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
      const finishedSlotIds = new Set(finished.map((row) => row.slotId));
      const slots = blueprintSlots(approved.blueprint);
      event.setDetail({ slots: slots.length, alreadyWritten: finishedSlotIds.size });

      const stored = await db.select().from(lessonResearch).where(eq(lessonResearch.courseRequestId, courseRequestId));
      const packsBySlot = new Map(stored.map((row) => [row.slotId, row.sourcePacks as SourcePack[]]));
      const unresearched = slots.filter((slot) => slot.method === readingPlugin.id && !finishedSlotIds.has(slot.id) && !packsBySlot.has(slot.id));
      /** Slots whose whole query ladder came back with nothing to cite, and whether a vendor simply never answered. */
      const empty = new Map<string, boolean>();
      if (unresearched.length) {
        stage = { kind: "research" };
        await control.progress("research", null);
        // Every call runs to the end, even after one fails, so each finished slot is stored and Resume skips it.
        const outcomes = await Promise.allSettled(unresearched.map(async (slot) => {
          const search = await withPipelineEvent("research", { label: slot.title, detail: { slotId: slot.id } }, async (step) => {
            const found = await searchForEvidence(research, researchQueries(request.subject, slot, request.focus?.scope ?? null));
            step.setDetail({
              queries: found.queries, interrupted: found.interrupted,
              packs: found.packs.map((pack) => ({ adapter: pack.adapter, status: pack.status, sources: pack.sources.length })),
            });
            return found;
          });
          // Packs with nothing to cite are not stored, so a Retry searches again instead of resuming from them.
          if (lessonEvidence(search.packs).size === 0) {
            empty.set(slot.id, search.interrupted);
            return;
          }
          await holding((transaction) => transaction.insert(lessonResearch).values({ courseRequestId, slotId: slot.id, sourcePacks: search.packs }));
          packsBySlot.set(slot.id, search.packs);
        }));
        const failed = outcomes.find((outcome) => outcome.status === "rejected");
        if (failed) {
          const lost = outcomes.find((outcome) => outcome.status === "rejected" && outcome.reason instanceof LeaseLostError);
          throw ((lost ?? failed) as PromiseRejectedResult).reason;
        }
      }
      // A Reading with nothing to ground it fails the Course before any more is written (spec §5.9).
      const unresearchable = slots.find((slot) => slot.method === readingPlugin.id && !finishedSlotIds.has(slot.id) &&
        lessonEvidence(packsBySlot.get(slot.id) ?? []).size === 0);
      if (unresearchable) {
        // A vendor that never answered leaves the topic unjudged: that is an interruption Retry searches again, not a
        // Lesson we can say is hard to research (spec §5.9, SEN-85).
        if (empty.get(unresearchable.id)) {
          throw new Error(`[course-generation: research] Research did not finish for this Reading || slotId=${unresearchable.id}`);
        }
        stage = { kind: "lesson", title: unresearchable.title };
        throw new LessonUnresearchableError(unresearchable.id);
      }

      // Lessons are written one at a time in Blueprint order. A Quiz reads its Readings from their checkpoints, not
      // this run's memory, so it assesses exactly what was saved; every Reading it assesses precedes it.
      const quizGenerator = options.quizGenerator ?? createQuizGenerator();
      for (const [position, slot] of slots.entries()) {
        const saved = finished.find((row) => row.slotId === slot.id);
        if (slot.method === readingPlugin.id && saved) {
          priorLessons.push({
            title: saved.title,
            lessonGoal: saved.lessonGoal,
            objectives: saved.objectives,
            headings: (saved.body as ReadingBody).sections.map((section) => section.heading),
          });
        }
        if (saved) continue;
        stage = { kind: "lesson", title: slot.title };
        await control.progress("lesson", slot.id);

        if (slot.method === readingPlugin.id) {
          const packs = packsBySlot.get(slot.id);
          if (!packs) throw new Error(`[course-generation: lesson] Reading slot has no stored research || slotId=${slot.id}`);
          const { lesson, judge, grounding, rejectedSources, authorModelIds, judgeModelId } = await withPipelineEvent("reading", {
            label: slot.title, detail: { slotId: slot.id, position },
          }, async (step) => {
            let checked: CheckedReading;
            try {
              checked = await generator.generate({
                courseTitle: approved.blueprint.courseTitle,
                learningGoal: request.learningGoal,
                scope: request.focus?.scope ?? null,
                slot,
                priorLessons: [...priorLessons],
                profile,
                packs,
              });
            } catch (error) {
              // Rejected drafts are saved nowhere else, so the event keeps every draft, edit, and verdict, pass or fail.
              if (error instanceof ReadingFailedError) step.setDetail({ grounding: error.grounding, rejectedSources: error.rejectedSources, rounds: error.rounds });
              throw error;
            }
            step.setDetail({
              repairs: checked.repairs, judgePass: checked.judge.pass, rejectedSources: checked.rejectedSources.length,
              authorModelIds: checked.authorModelIds, judgeModelId: checked.judgeModelId,
              grounding: checked.grounding, rounds: checked.rounds,
            });
            return checked;
          });
          await holding((transaction) => transaction.insert(unpublishedLessons).values({
            ...lesson, courseRequestId, position, rejectedSources, judge, authorModelIds, judgeModelId,
          }));
          priorLessons.push({
            title: lesson.title,
            lessonGoal: lesson.lessonGoal,
            objectives: lesson.objectives,
            headings: lesson.body.sections.map((section) => section.heading),
          });
          continue;
        }

        const readings = await db.select().from(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
        const assessed = slot.assessesSlotIds.flatMap((slotId) => {
          const checkpoint = readings.find((row) => row.slotId === slotId && row.teachingMethod === readingPlugin.id);
          return checkpoint ? [{ ...checkpoint, body: checkpoint.body as ReadingBody }] : [];
        });
        const { lesson, judge, authorModelIds, judgeModelId } = await withPipelineEvent("quiz", {
          label: slot.title, detail: { slotId: slot.id, position, assessedSlotIds: slot.assessesSlotIds },
        }, async (step) => {
          let checked: CheckedQuiz;
          try {
            checked = await quizGenerator.generate({
              courseTitle: approved.blueprint.courseTitle,
              learningGoal: request.learningGoal,
              scope: request.focus?.scope ?? null,
              slot,
              slots,
              assessed,
              profile: writeTimeProfile(quizPlugin, resolved),
            });
          } catch (error) {
            // A rejected Quiz is saved nowhere else, so the event keeps every draft and verdict, pass or fail.
            if (error instanceof QuizFailedError) step.setDetail({ grounding: error.grounding, rounds: error.rounds });
            throw error;
          }
          step.setDetail({
            repairs: checked.repairs, judgePass: checked.judge.pass, grounding: checked.grounding,
            authorModelIds: checked.authorModelIds, judgeModelId: checked.judgeModelId, rounds: checked.rounds,
          });
          return checked;
        });
        await holding((transaction) => transaction.insert(unpublishedLessons).values({
          ...lesson, courseRequestId, position, rejectedSources: [], judge, authorModelIds, judgeModelId,
        }));
      }

      stage = { kind: "course" };
      await control.progress("publish", null);
      const checkpoints = await db.select().from(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
      const codeFailures = courseCodeFailures(approved, checkpoints);
      if (codeFailures.length) throw new CourseFailedError(codeFailures, null);
      const [diagnostic] = await db.select({ startingLevel: startingLevelDiagnostics.startingLevel }).from(startingLevelDiagnostics)
        .where(eq(startingLevelDiagnostics.courseRequestId, courseRequestId))
        .orderBy(desc(startingLevelDiagnostics.createdAt)).limit(1);
      if (!diagnostic?.startingLevel) throw new Error(`[course-generation: publish] Request has no Starting Level || requestId=${courseRequestId}`);
      const courseJudge = options.courseJudge ?? createCourseJudge();
      // A checkpoint from before SEN-57 names no author; the primary Generator wrote it.
      const authors = new Set(checkpoints.flatMap((checkpoint) =>
        checkpoint.authorModelIds.length ? checkpoint.authorModelIds : [loadModelConfig().generatorModel]));
      const outline = courseOutline(approved, checkpoints, request.learningGoal, diagnostic.startingLevel.remainingGapStatement, request.focus?.scope ?? null);
      const verdict = await withPipelineEvent("course_judge", { detail: { authorModelIds: [...authors] } }, async (step) => {
        const judged = await courseJudge.judge(outline, [...authors]);
        step.setDetail({ pass: judged.pass, failedChecks: judged.failedChecks });
        return judged;
      });
      if (!verdict.pass) throw new CourseFailedError([], verdict);

      const rows = publicationRows({
        learnerId, courseRequestId, subject: request.subject, learningGoal: request.learningGoal, approved, checkpoints,
      });
      await withPipelineEvent("publish", { detail: { lessons: rows.lessons.length, modules: rows.modules.length } }, () => db.transaction(async (transaction) => {
        await control.hold(transaction);
        await transaction.insert(publishedCourses).values(rows.course);
        await transaction.insert(publishedModules).values(rows.modules);
        await transaction.insert(publishedLessons).values(rows.lessons);
        const [published] = await transaction.update(courseRequests).set({ status: "published" })
          .where(and(eq(courseRequests.id, courseRequestId), eq(courseRequests.status, "generating"))).returning({ id: courseRequests.id });
        if (!published) throw new Error(`[course-generation: publish] Request is no longer generating || requestId=${courseRequestId}`);
        await control.settle(transaction, "succeeded");
      }));
    } catch (error) {
      // A run that lost its job records nothing: Cancel already moved the Request, or another worker owns it.
      if (error instanceof LeaseLostError) throw error;
      try {
        // What the failure can promise a Retry keeps depends on how many Lessons are checkpointed (SEN-95).
        const written = await db.select({ id: unpublishedLessons.id }).from(unpublishedLessons)
          .where(eq(unpublishedLessons.courseRequestId, courseRequestId));
        const settled = settledStatus(error);
        // A sequence that misses the goal is the plan's fault, so the Request goes back for a new one (spec §5.1, SEN-85).
        const [plan] = settled === "needs_new_blueprint"
          ? await db.select().from(courseBlueprints).where(eq(courseBlueprints.courseRequestId, courseRequestId)).limit(1)
          : [];
        await db.transaction(async (transaction) => {
          await control.settle(transaction, settled);
          if (error instanceof LessonUnresearchableError) {
            await transaction.delete(lessonResearch)
              .where(and(eq(lessonResearch.courseRequestId, courseRequestId), eq(lessonResearch.slotId, error.slotId)));
          }
          const structural = plan !== undefined && error instanceof CourseFailedError ? error : null;
          const [moved] = await transaction.update(courseRequests)
            .set({ status: structural ? "blueprint_preparing" : "generation_failed", failureReason: failureReason(stage, error, written.length) })
            .where(and(eq(courseRequests.id, courseRequestId), eq(courseRequests.status, "generating"))).returning({ id: courseRequests.id });
          // Only a Request this run still owned is taken apart: one that moved on (a Cancel, or a publish) keeps everything.
          if (!structural || !moved) return;
          // Nothing written under the failed plan survives it: its Lessons are discarded (spec §5.1), and its stored
          // research is keyed to slot ids the new plan will not have.
          await transaction.delete(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
          await transaction.delete(lessonResearch).where(eq(lessonResearch.courseRequestId, courseRequestId));
          // The approved snapshot goes, so no worker generates this plan again; the draft carries why it has to change.
          const { learnerFeedback: _marks, ...draft } = plan.draft;
          await transaction.update(courseBlueprints)
            .set({ draft: { ...draft, sequenceFailure: { reasons: structural.judge?.reasons ?? [] } }, approved: null, approvedAt: null })
            .where(eq(courseBlueprints.id, plan.id)).returning({ id: courseBlueprints.id });
          await enqueueJob(transaction, { courseRequestId, learnerId, kind: "blueprint" });
        });
      } catch (recordError) {
        if (recordError instanceof LeaseLostError) throw error;
        const detail = (caught: unknown) => caught instanceof Error ? caught.message : String(caught);
        throw new Error(`[course-generation: start] Failed to record the generation failure || requestId=${courseRequestId} || ${detail(recordError)} || ${detail(error)}`);
      }
      throw error;
    }
  }
}
