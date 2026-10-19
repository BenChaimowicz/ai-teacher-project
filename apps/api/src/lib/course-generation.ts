import { and, desc, eq } from "drizzle-orm";
import { blueprintSlots, type ApprovedBlueprint, type BlueprintSlot, type JudgeResult } from "@senoy/db/blueprint";
import {
  courseCodeFailures,
  courseRequests,
  learners,
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
} from "@senoy/db";
import { researchAdaptersFromEnv, runResearch, type SourcePack } from "@senoy/research";
import { quizPlugin } from "../teaching-methods/quiz.ts";
import { readingPlugin } from "../teaching-methods/reading.ts";
import type { TeachingMethodPlugin } from "../teaching-methods/types.ts";
import { courseOutline, createCourseJudge, type CourseJudge } from "./course-judge.ts";
import { LeaseLostError, type GenerationControl } from "./generation-job.ts";
import { createQuizGenerator, QuizFailedError, type QuizGenerator } from "./quiz-generation.ts";
import { createReadingGenerator, ReadingFailedError, type PriorLesson, type ReadingGenerator } from "./reading-generation.ts";

/** What one run of a claimed generation job receives. */
export type GenerationStart = {
  db: Database;
  courseRequestId: string;
  learnerId: string;
  approved: ApprovedBlueprint;
  control: GenerationControl;
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
}

/** Where generation stopped, so its failure can be told in plain language. */
type Stage = { kind: "lesson"; title: string } | { kind: "course" };

/** What the Learner can do after a failed check, until Retry and Revise exist (SEN-57). */
const NEXT_STEP = "You can start a new Course Request from Home.";

/** What the Learner can do after an interruption. */
const RESUME_STEP = "Resume continues from the next unfinished Lesson.";

/**
 * Whether generation stopped on a failed check (final until SEN-57's Retry) rather than an interruption (a provider
 * error, timeout, or crash) that Resume continues (spec §5.1).
 * @param error - What stopped generation
 */
export function failedCheck(error: unknown): boolean {
  return error instanceof ReadingFailedError || error instanceof QuizFailedError || error instanceof CourseFailedError;
}

/**
 * The Learner-facing reason generation stopped. A failed check is said plainly; anything else is an interruption.
 * @param stage - Where generation stopped
 * @param error - What stopped it
 */
export function failureReason(stage: Stage, error: unknown): string {
  if (stage.kind === "lesson") {
    return failedCheck(error)
      ? `We couldn't write the Lesson “${stage.title}” so that it passed our quality checks. ${NEXT_STEP}`
      : `Generation was interrupted while writing the Lesson “${stage.title}”. ${RESUME_STEP}`;
  }
  return failedCheck(error)
    ? `The finished Lessons didn't fit together well enough to publish as one Course. ${NEXT_STEP}`
    : `Generation was interrupted while publishing your Course. ${RESUME_STEP}`;
}

/**
 * The research topic for one slot: research is scoped per Lesson (spec §5.2).
 * @param subject - The Course Request subject
 * @param slot - The Blueprint slot
 */
export function lessonResearchTopic(subject: string, slot: BlueprintSlot): string {
  return `${slot.title} (${subject}). ${slot.lessonGoal} Covers: ${slot.objectives.join("; ")}.`;
}

/**
 * Only the write-time Teaching Profile values a plugin declared (spec §5.5).
 * @param plugin - The slot's Teaching-method plugin
 * @param profile - The Learner's resolved Teaching Profile
 */
export function writeTimeProfile(plugin: TeachingMethodPlugin, profile: ResolvedTeachingProfile): Record<string, unknown> {
  return Object.fromEntries(plugin.writeTimeFields.map((field) => [field, profile[field].value]));
}

/** Research run against both vendors with keys from the environment. */
const researchFromEnv: LessonResearch = (topic) => runResearch(topic, { ...researchAdaptersFromEnv(process.env), env: process.env });

/**
 * Generates each Reading slot in Blueprint order, then each Quiz from its checkpointed Readings (spec §5.2.3), saving
 * each as an unpublished checkpoint. Then the whole-Course Code checks and one Judge pass over the outline (spec §6.5),
 * and atomic publish: the Course snapshot, the `published` status, and the job's success in one transaction.
 *
 * A slot that already has a checkpoint is not generated again, so a resumed or reclaimed job continues from the next
 * unfinished Lesson; earlier Readings reach later ones from their checkpoints. Every write first proves the run still
 * holds its job, so after Cancel or a lapsed lease the run stops at its next stage and saves nothing.
 *
 * Any failure publishes nothing and keeps the checkpoints. A failed check fails the job; an interruption leaves it
 * `interrupted` for Resume. Either moves the Request to `generation_failed` with a plain-language reason. Repair of a
 * failed whole-Course check is SEN-57's.
 * @param options - Injected research, Generators, and Judge; tests pass fixtures
 */
export function createCourseGeneration(options: CourseGenerationOptions = {}): CourseGeneration {
  return {
    async start({ db, courseRequestId, learnerId, approved, control }) {
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
        /** Saves one finished Lesson, only while this run still holds the job. */
        const saveCheckpoint = (values: typeof unpublishedLessons.$inferInsert) => db.transaction(async (transaction) => {
          await control.hold(transaction);
          await transaction.insert(unpublishedLessons).values(values);
        });
        const finished = await db.select().from(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
        const finishedSlotIds = new Set(finished.map((row) => row.slotId));

        const slots = blueprintSlots(approved.blueprint);
        for (const [position, slot] of slots.entries()) {
          if (slot.method !== readingPlugin.id) continue;
          const saved = finished.find((row) => row.slotId === slot.id);
          if (saved) {
            priorLessons.push({
              title: saved.title,
              lessonGoal: saved.lessonGoal,
              objectives: saved.objectives,
              headings: (saved.body as ReadingBody).sections.map((section) => section.heading),
            });
            continue;
          }
          stage = { kind: "lesson", title: slot.title };
          await control.progress("lesson", slot.id);
          const packs = await research(lessonResearchTopic(request.subject, slot));
          const { lesson, judge, rejectedSources } = await generator.generate({
            courseTitle: approved.blueprint.courseTitle,
            learningGoal: request.learningGoal,
            slot,
            priorLessons,
            profile,
            packs,
          });
          await saveCheckpoint({ ...lesson, courseRequestId, position, sourcePacks: packs, rejectedSources, judge });
          priorLessons.push({
            title: lesson.title,
            lessonGoal: lesson.lessonGoal,
            objectives: lesson.objectives,
            headings: lesson.body.sections.map((section) => section.heading),
          });
        }

        // Quizzes follow every instructional Lesson and read the checkpoints, not this run's memory, so they assess
        // exactly what was saved.
        const quizGenerator = options.quizGenerator ?? createQuizGenerator();
        const readings = await db.select().from(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
        for (const [position, slot] of slots.entries()) {
          if (slot.method !== quizPlugin.id || finishedSlotIds.has(slot.id)) continue;
          stage = { kind: "lesson", title: slot.title };
          await control.progress("lesson", slot.id);
          const assessed = slot.assessesSlotIds.flatMap((slotId) => {
            const checkpoint = readings.find((row) => row.slotId === slotId && row.teachingMethod === readingPlugin.id);
            return checkpoint ? [{ ...checkpoint, body: checkpoint.body as ReadingBody }] : [];
          });
          const { lesson, judge } = await quizGenerator.generate({
            courseTitle: approved.blueprint.courseTitle,
            learningGoal: request.learningGoal,
            slot,
            slots,
            assessed,
            profile: writeTimeProfile(quizPlugin, resolved),
          });
          await saveCheckpoint({ ...lesson, courseRequestId, position, sourcePacks: [], rejectedSources: [], judge });
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
        const verdict = await courseJudge.judge(courseOutline(approved, checkpoints, request.learningGoal, diagnostic.startingLevel.remainingGapStatement));
        if (!verdict.pass) throw new CourseFailedError([], verdict);

        const rows = publicationRows({
          learnerId, courseRequestId, subject: request.subject, learningGoal: request.learningGoal, approved, checkpoints,
        });
        await db.transaction(async (transaction) => {
          await control.hold(transaction);
          await transaction.insert(publishedCourses).values(rows.course);
          await transaction.insert(publishedModules).values(rows.modules);
          await transaction.insert(publishedLessons).values(rows.lessons);
          const [published] = await transaction.update(courseRequests).set({ status: "published" })
            .where(and(eq(courseRequests.id, courseRequestId), eq(courseRequests.status, "generating"))).returning({ id: courseRequests.id });
          if (!published) throw new Error(`[course-generation: publish] Request is no longer generating || requestId=${courseRequestId}`);
          await control.settle(transaction, "succeeded");
        });
      } catch (error) {
        // A run that lost its job records nothing: Cancel already moved the Request, or another worker owns it.
        if (error instanceof LeaseLostError) throw error;
        try {
          await db.transaction(async (transaction) => {
            await control.settle(transaction, failedCheck(error) ? "failed" : "interrupted");
            await transaction.update(courseRequests).set({ status: "generation_failed", failureReason: failureReason(stage, error) })
              .where(and(eq(courseRequests.id, courseRequestId), eq(courseRequests.status, "generating"))).returning({ id: courseRequests.id });
          });
        } catch (recordError) {
          if (recordError instanceof LeaseLostError) throw error;
          const detail = (caught: unknown) => caught instanceof Error ? caught.message : String(caught);
          throw new Error(`[course-generation: start] Failed to record the generation failure || requestId=${courseRequestId} || ${detail(recordError)} || ${detail(error)}`);
        }
        throw error;
      }
    },
  };
}
