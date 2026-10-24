import { and, desc, eq } from "drizzle-orm";
import {
  courseBlueprints,
  courseRequests,
  learners,
  resolveTeachingProfile,
  startingLevelDiagnostics,
  type Database,
} from "@senoy/db";
import { blueprintSlots } from "@senoy/db/blueprint";
import { BlueprintFailedError, createBlueprintBuilder, MAX_BLUEPRINT_REVISIONS, type BlueprintBuilder } from "./blueprint.ts";
import { LeaseLostError, type GenerationControl } from "./generation-job.ts";
import { withPipelineEvent } from "./usage-tracking.ts";

/** What one run of a claimed Blueprint job receives. */
export type BlueprintJobStart = {
  db: Database;
  courseRequestId: string;
  learnerId: string;
  control: GenerationControl;
};

/** Blueprint design and system validation before Learner review; the worker runs it as a durable job (spec §5.1). */
export interface BlueprintJob {
  start(input: BlueprintJobStart): Promise<void>;
}

/**
 * The Learner-facing reason a Blueprint job failed, with its next step.
 * @param error - What stopped the job
 */
export function blueprintFailureReason(error: unknown): string {
  return error instanceof BlueprintFailedError
    ? `We couldn't design a Course Blueprint that passed our checks, even after ${MAX_BLUEPRINT_REVISIONS} revisions. Try again for a fresh design.`
    : "We couldn't finish designing your Course Blueprint. Try again.";
}

/**
 * Creates the Blueprint job. A run designs from the confirmed Starting Level and the Learner's Teaching Profile, then
 * saves the checked draft and moves the Request to `blueprint_review` in one transaction that proves it still holds
 * the job. The job keeps no checkpoints: a reclaimed run designs again from the start.
 *
 * Any failure saves no draft, fails the job, and returns the Request to `starting_level_confirmed` with a reason and
 * Try again.
 * @param builder - Blueprint builder; tests and browser tests pass fixtures
 */
export function createBlueprintJob(builder: BlueprintBuilder = createBlueprintBuilder()): BlueprintJob {
  return {
    start(input) {
      return withPipelineEvent("blueprint", { courseRequestId: input.courseRequestId, learnerId: input.learnerId }, async (event) => {
        const { db, courseRequestId, learnerId, control } = input;
        try {
          const [request] = await db.select().from(courseRequests).where(eq(courseRequests.id, courseRequestId)).limit(1);
          const [learner] = await db.select().from(learners).where(eq(learners.id, learnerId)).limit(1);
          const [attempt] = await db.select().from(startingLevelDiagnostics)
            .where(eq(startingLevelDiagnostics.courseRequestId, courseRequestId))
            .orderBy(desc(startingLevelDiagnostics.createdAt)).limit(1);
          if (!request || !learner?.teachingProfileAnswers || !attempt?.startingLevel || !attempt.confirmation) {
            throw new Error(`[blueprint-job: start] Request, Teaching Profile, or confirmed Starting Level is missing || requestId=${courseRequestId}`);
          }
          const profile = resolveTeachingProfile(learner.teachingProfileAnswers);
          event.setDetail({ subject: request.subject });
          const checked = await builder.build({
            subject: request.subject,
            learningGoal: request.learningGoal,
            startingLevel: attempt.startingLevel,
            confirmation: attempt.confirmation,
            profile: {
              instructionLanguage: profile.instructionLanguage.value,
              quizCadence: profile.quizCadence.value,
              explanationOrder: profile.explanationOrder.value,
            },
          });
          event.setDetail({
            courseTitle: checked.blueprint.courseTitle,
            slots: blueprintSlots(checked.blueprint).length,
            judgePass: checked.judge.pass,
          });
          await db.transaction(async (transaction) => {
            await control.hold(transaction);
            await transaction.insert(courseBlueprints).values({ courseRequestId, learnerId, draft: checked.blueprint, judge: checked.judge });
            const [ready] = await transaction.update(courseRequests).set({ status: "blueprint_review", failureReason: null })
              .where(and(eq(courseRequests.id, courseRequestId), eq(courseRequests.status, "blueprint_preparing"))).returning({ id: courseRequests.id });
            if (!ready) throw new Error(`[blueprint-job: start] Request is no longer preparing a Blueprint || requestId=${courseRequestId}`);
            await control.settle(transaction, "succeeded");
          });
        } catch (error) {
          // A run that lost its job records nothing: another worker owns it now.
          if (error instanceof LeaseLostError) throw error;
          try {
            await db.transaction(async (transaction) => {
              await control.settle(transaction, "failed");
              await transaction.update(courseRequests).set({ status: "starting_level_confirmed", failureReason: blueprintFailureReason(error) })
                .where(and(eq(courseRequests.id, courseRequestId), eq(courseRequests.status, "blueprint_preparing"))).returning({ id: courseRequests.id });
            });
          } catch (recordError) {
            if (recordError instanceof LeaseLostError) throw error;
            const detail = (caught: unknown) => caught instanceof Error ? caught.message : String(caught);
            throw new Error(`[blueprint-job: start] Failed to record the Blueprint failure || requestId=${courseRequestId} || ${detail(recordError)} || ${detail(error)}`);
          }
          throw error;
        }
      });
    },
  };
}
