import { and, desc, eq, isNull } from "drizzle-orm";
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

/** Shown when redesigning from the Learner's marks failed; the plan they reviewed is still there. */
export const REVISE_FAILED_REASON = "We couldn't redo the plan without those lessons. Here it is as it was: try again, or make it as it is.";

/**
 * Creates the Blueprint job. A run designs from the confirmed Starting Level and the Learner's Teaching Profile, then
 * saves the checked draft and moves the Request to `blueprint_review` in one transaction that proves it still holds
 * the job. The job keeps no checkpoints: a reclaimed run designs again from the start.
 *
 * Any failure saves no draft, fails the job, and returns the Request to `starting_level_confirmed` with a reason and
 * Try again.
 *
 * A Request back from Learner review has a draft carrying the Learner's marks (`learnerFeedback`, spec §4.4): the run
 * redesigns from them and replaces that draft. If the redesign fails, the Request returns to `blueprint_review` with
 * the draft the Learner reviewed, its marks cleared.
 * @param builder - Blueprint builder; tests and browser tests pass fixtures
 */
export function createBlueprintJob(builder: BlueprintBuilder = createBlueprintBuilder()): BlueprintJob {
  return {
    start(input) {
      return withPipelineEvent("blueprint", { courseRequestId: input.courseRequestId, learnerId: input.learnerId }, async (event) => {
        const { db, courseRequestId, learnerId, control } = input;
        let reviewed: typeof courseBlueprints.$inferSelect | undefined;
        try {
          [reviewed] = await db.select().from(courseBlueprints).where(eq(courseBlueprints.courseRequestId, courseRequestId)).limit(1);
          const feedback = reviewed && !reviewed.approved ? reviewed.draft.learnerFeedback : undefined;
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
            ...(reviewed && feedback?.irrelevantSlotIds.length ? { revision: { previousBlueprint: reviewed.draft, feedback } } : {}),
          });
          event.setDetail({
            courseTitle: checked.blueprint.courseTitle,
            slots: blueprintSlots(checked.blueprint).length,
            judgePass: checked.judge.pass,
          });
          await db.transaction(async (transaction) => {
            await control.hold(transaction);
            if (reviewed) {
              const [replaced] = await transaction.update(courseBlueprints).set({ draft: checked.blueprint, judge: checked.judge })
                .where(and(eq(courseBlueprints.id, reviewed.id), isNull(courseBlueprints.approved))).returning({ id: courseBlueprints.id });
              if (!replaced) throw new Error(`[blueprint-job: start] The reviewed Blueprint is no longer a draft || requestId=${courseRequestId}`);
            } else {
              await transaction.insert(courseBlueprints).values({ courseRequestId, learnerId, draft: checked.blueprint, judge: checked.judge });
            }
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
              if (reviewed) {
                const { learnerFeedback: _cleared, ...draft } = reviewed.draft;
                await transaction.update(courseBlueprints).set({ draft }).where(eq(courseBlueprints.id, reviewed.id)).returning({ id: courseBlueprints.id });
              }
              await transaction.update(courseRequests).set(reviewed
                ? { status: "blueprint_review", failureReason: REVISE_FAILED_REASON }
                : { status: "starting_level_confirmed", failureReason: blueprintFailureReason(error) })
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
