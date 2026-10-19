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
import { createQuizGenerator, QuizFailedError, type QuizGenerator } from "./quiz-generation.ts";
import { createReadingGenerator, ReadingFailedError, type PriorLesson, type ReadingGenerator } from "./reading-generation.ts";

/** What generation receives after Approve. */
export type GenerationStart = {
  db: Database;
  courseRequestId: string;
  learnerId: string;
  approved: ApprovedBlueprint;
};

/**
 * Full-Course generation for an approved Blueprint, through atomic publish. Runs in the API process; it is not yet a
 * durable job (spec §5.1).
 */
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

/** What the Learner can do next until Retry and Revise exist (SEN-57). */
const NEXT_STEP = "You can start a new Course Request from Home.";

/**
 * The Learner-facing reason generation stopped. A failed check is said plainly; anything else (a provider error,
 * timeout, or crash) is an interruption (spec §5.1).
 * @param stage - Where generation stopped
 * @param error - What stopped it
 */
export function failureReason(stage: Stage, error: unknown): string {
  if (stage.kind === "lesson") {
    const checked = error instanceof ReadingFailedError || error instanceof QuizFailedError;
    return checked
      ? `We couldn't write the Lesson “${stage.title}” so that it passed our quality checks. ${NEXT_STEP}`
      : `Generation was interrupted while writing the Lesson “${stage.title}”. ${NEXT_STEP}`;
  }
  return error instanceof CourseFailedError
    ? `The finished Lessons didn't fit together well enough to publish as one Course. ${NEXT_STEP}`
    : `Generation was interrupted while publishing your Course. ${NEXT_STEP}`;
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
 * and atomic publish: the Course snapshot and the `published` status in one transaction. Any failure publishes nothing,
 * keeps the checkpoints, and moves the Request to `generation_failed` with a plain-language reason. Repair of a failed
 * whole-Course check is SEN-57's.
 * @param options - Injected research, Generators, and Judge; tests pass fixtures
 */
export function createCourseGeneration(options: CourseGenerationOptions = {}): CourseGeneration {
  return {
    async start({ db, courseRequestId, learnerId, approved }) {
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

        const slots = blueprintSlots(approved.blueprint);
        for (const [position, slot] of slots.entries()) {
          if (slot.method !== readingPlugin.id) continue;
          stage = { kind: "lesson", title: slot.title };
          const packs = await research(lessonResearchTopic(request.subject, slot));
          const { lesson, judge, rejectedSources } = await generator.generate({
            courseTitle: approved.blueprint.courseTitle,
            learningGoal: request.learningGoal,
            slot,
            priorLessons,
            profile,
            packs,
          });
          await db.insert(unpublishedLessons).values({ ...lesson, courseRequestId, position, sourcePacks: packs, rejectedSources, judge });
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
          if (slot.method !== quizPlugin.id) continue;
          stage = { kind: "lesson", title: slot.title };
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
          await db.insert(unpublishedLessons).values({ ...lesson, courseRequestId, position, sourcePacks: [], rejectedSources: [], judge });
        }

        stage = { kind: "course" };
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
          await transaction.insert(publishedCourses).values(rows.course);
          await transaction.insert(publishedModules).values(rows.modules);
          await transaction.insert(publishedLessons).values(rows.lessons);
          const [published] = await transaction.update(courseRequests).set({ status: "published" })
            .where(and(eq(courseRequests.id, courseRequestId), eq(courseRequests.status, "generating"))).returning({ id: courseRequests.id });
          if (!published) throw new Error(`[course-generation: publish] Request is no longer generating || requestId=${courseRequestId}`);
        });
      } catch (error) {
        try {
          await db.update(courseRequests).set({ status: "generation_failed", failureReason: failureReason(stage, error) })
            .where(and(eq(courseRequests.id, courseRequestId), eq(courseRequests.status, "generating"))).returning({ id: courseRequests.id });
        } catch (recordError) {
          const detail = (caught: unknown) => caught instanceof Error ? caught.message : String(caught);
          throw new Error(`[course-generation: start] Failed to record the generation failure || requestId=${courseRequestId} || ${detail(recordError)} || ${detail(error)}`);
        }
        throw error;
      }
    },
  };
}
