import { eq } from "drizzle-orm";
import { blueprintSlots, type ApprovedBlueprint, type BlueprintSlot } from "@senoy/db/blueprint";
import { courseRequests, learners, resolveTeachingProfile, unpublishedLessons, type Database, type ReadingBody, type ResolvedTeachingProfile } from "@senoy/db";
import { researchAdaptersFromEnv, runResearch, type SourcePack } from "@senoy/research";
import { quizPlugin } from "../teaching-methods/quiz.ts";
import { readingPlugin } from "../teaching-methods/reading.ts";
import type { TeachingMethodPlugin } from "../teaching-methods/types.ts";
import { createQuizGenerator, type QuizGenerator } from "./quiz-generation.ts";
import { createReadingGenerator, type PriorLesson, type ReadingGenerator } from "./reading-generation.ts";

/** What generation receives after Approve. */
export type GenerationStart = {
  db: Database;
  courseRequestId: string;
  learnerId: string;
  approved: ApprovedBlueprint;
};

/**
 * Full-Course generation for an approved Blueprint. Runs in the API process on the happy path; it is not yet a
 * durable job (spec §5.1).
 */
export interface CourseGeneration {
  start(input: GenerationStart): Promise<void>;
}

/** Primary and Secondary research for one Lesson topic. */
export type LessonResearch = (topic: string) => Promise<SourcePack[]>;

/** Injectable research and Generator; omitted ones are created lazily from the environment. */
export type CourseGenerationOptions = { research?: LessonResearch; readingGenerator?: ReadingGenerator; quizGenerator?: QuizGenerator };

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
 * each as an unpublished checkpoint. Publication and repair are later tickets, so the Request stays `generating`; a
 * failed Lesson throws and nothing is saved for it.
 * @param options - Injected research and Generator; tests pass fixtures
 */
export function createCourseGeneration(options: CourseGenerationOptions = {}): CourseGeneration {
  return {
    async start({ db, courseRequestId, learnerId, approved }) {
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
      const checkpoints = await db.select().from(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
      for (const [position, slot] of slots.entries()) {
        if (slot.method !== quizPlugin.id) continue;
        const assessed = slot.assessesSlotIds.flatMap((slotId) => {
          const checkpoint = checkpoints.find((row) => row.slotId === slotId && row.teachingMethod === readingPlugin.id);
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
    },
  };
}
