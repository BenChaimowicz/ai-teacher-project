import { eq } from "drizzle-orm";
import { blueprintSlots, type ApprovedBlueprint, type BlueprintSlot } from "@senoy/db/blueprint";
import { courseRequests, learners, resolveTeachingProfile, unpublishedLessons, type Database, type ResolvedTeachingProfile } from "@senoy/db";
import { researchAdaptersFromEnv, runResearch, type SourcePack } from "@senoy/research";
import { readingPlugin } from "../teaching-methods/reading.ts";
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
export type CourseGenerationOptions = { research?: LessonResearch; readingGenerator?: ReadingGenerator };

/**
 * The research topic for one slot: research is scoped per Lesson (spec §5.2).
 * @param subject - The Course Request subject
 * @param slot - The Blueprint slot
 */
export function lessonResearchTopic(subject: string, slot: BlueprintSlot): string {
  return `${slot.title} (${subject}). ${slot.lessonGoal} Covers: ${slot.objectives.join("; ")}.`;
}

/**
 * Only the write-time Teaching Profile values the reading plugin declared (spec §5.5).
 * @param profile - The Learner's resolved Teaching Profile
 */
export function readingWriteTimeProfile(profile: ResolvedTeachingProfile): Record<string, unknown> {
  return Object.fromEntries(readingPlugin.writeTimeFields.map((field) => [field, profile[field].value]));
}

/** Research run against both vendors with keys from the environment. */
const researchFromEnv: LessonResearch = (topic) => runResearch(topic, { ...researchAdaptersFromEnv(process.env), env: process.env });

/**
 * Generates each Reading slot in Blueprint order and saves it as an unpublished checkpoint. Quizzes, publication,
 * and repair are later tickets, so the Request stays `generating`; a failed Lesson throws and nothing is saved for it.
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
      const profile = readingWriteTimeProfile(resolveTeachingProfile(learner.teachingProfileAnswers));
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
    },
  };
}
