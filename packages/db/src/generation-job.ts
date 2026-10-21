/**
 * What a job produces: the Course Blueprint before Learner review, or the whole Course after Approve (spec §5.1). A
 * Request has at most one job of each kind.
 */
export const GENERATION_JOB_KINDS = ["blueprint", "course"] as const;

/** One generation job kind. */
export type GenerationJobKind = (typeof GENERATION_JOB_KINDS)[number];

/**
 * Where a generation job is in its lifecycle (spec §5.1). `queued` waits for a worker; `running` is held by one
 * worker's lease; `cancelled` and `interrupted` keep their checkpoints and wait for the Learner's Resume; `failed`
 * (checks did not pass) and `succeeded` (published) are final.
 *
 * The Request's status moves in the same transaction as the job's: the Request is `blueprint_preparing` exactly while
 * its Blueprint job is `queued` or `running`, and `generating` exactly while its Course job is. A Blueprint job ends
 * `succeeded` or `failed`; it is never cancelled or interrupted.
 */
export const GENERATION_JOB_STATUSES = ["queued", "running", "cancelled", "interrupted", "failed", "succeeded"] as const;

/** One generation job status. */
export type GenerationJobStatus = (typeof GENERATION_JOB_STATUSES)[number];

/** What a running job is doing: writing one Lesson, or checking and publishing the whole Course. */
export const GENERATION_STAGES = ["lesson", "publish"] as const;

/** One generation stage. */
export type GenerationStage = (typeof GENERATION_STAGES)[number];

/**
 * What the Waiting screen shows of a job (spec §3): never a draft body, Sources, or a token stream.
 * `lessonNumber` and `lessonTitle` are set while a Lesson is being written; `finishedLessons` counts checkpoints.
 */
export type GenerationView = {
  status: GenerationJobStatus;
  stage: GenerationStage | null;
  lessonNumber: number | null;
  lessonTitle: string | null;
  finishedLessons: number;
  totalLessons: number;
};
