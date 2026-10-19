import { and, eq, sql } from "drizzle-orm";
import { generationJobs, type Database, type GenerationJobStatus, type GenerationStage, type Transaction } from "@senoy/db";

/** One worker's hold on one running job; every write the job makes is checked against `claimToken`. */
export type JobLease = {
  jobId: string;
  courseRequestId: string;
  learnerId: string;
  claimToken: string;
};

/** This run no longer holds its job: the Learner cancelled, or the lease lapsed and another worker claimed it. */
export class LeaseLostError extends Error {
  /** @param jobId - The job this run lost */
  constructor(jobId: string) {
    super(`[generation-job: lease] This run no longer holds the job || jobId=${jobId}`);
    this.name = "LeaseLostError";
  }
}

/** How a job ends when this run settles it. */
export type SettledStatus = Extract<GenerationJobStatus, "succeeded" | "failed" | "interrupted">;

/**
 * What generation needs from its job. Each call throws `LeaseLostError` once the run no longer holds the job, so a
 * cancelled or reclaimed run stops at its next stage boundary and never writes.
 */
export interface GenerationControl {
  /** Records what the Waiting screen shows; also the cancellation check between stages. */
  progress(stage: GenerationStage, slotId: string | null): Promise<void>;
  /** Locks the job row inside a write transaction, proving the run still holds it. */
  hold(transaction: Transaction): Promise<void>;
  /** Ends the job inside the transaction that moves its Request on, and releases the lease. */
  settle(transaction: Transaction, status: SettledStatus): Promise<void>;
}

/**
 * Queues the generation job for a just-approved Request. Call it in the transaction that moves the Request to
 * `generating`, so the two never disagree.
 * @param transaction - The approving transaction
 * @param job - The Request and its Learner
 */
export async function enqueueGeneration(transaction: Transaction, job: { courseRequestId: string; learnerId: string }) {
  await transaction.insert(generationJobs).values({ ...job, status: "queued" });
}

/**
 * Claims the oldest job that is queued or whose lease lapsed, with a fresh claim token. Concurrent workers skip rows
 * another worker is claiming, so each job has one holder.
 * @param db - Database
 * @param leaseMs - How long the claim holds before it must be renewed
 * @returns The lease, or null when no job is waiting
 */
export async function claimGenerationJob(db: Database, leaseMs: number): Promise<JobLease | null> {
  const next = sql`(
    select ${generationJobs.id} from ${generationJobs}
    where ${generationJobs.status} = 'queued' or (${generationJobs.status} = 'running' and ${generationJobs.leaseExpiresAt} < now())
    order by ${generationJobs.createdAt}
    limit 1
    for update skip locked
  )`;
  const [claimed] = await db.update(generationJobs).set({
    status: "running",
    claimToken: sql`gen_random_uuid()`,
    leaseExpiresAt: sql`now() + ${`${leaseMs} milliseconds`}::interval`,
    claims: sql`${generationJobs.claims} + 1`,
    updatedAt: sql`now()`,
  }).where(eq(generationJobs.id, next)).returning({
    jobId: generationJobs.id,
    courseRequestId: generationJobs.courseRequestId,
    learnerId: generationJobs.learnerId,
    claimToken: generationJobs.claimToken,
  });
  return claimed?.claimToken ? { ...claimed, claimToken: claimed.claimToken } : null;
}

/** Matches the job only while this lease still holds it. */
function held(lease: JobLease) {
  return and(eq(generationJobs.id, lease.jobId), eq(generationJobs.claimToken, lease.claimToken), eq(generationJobs.status, "running"));
}

/**
 * Extends the lease while generation runs.
 * @param db - Database
 * @param lease - This run's lease
 * @param leaseMs - New lease length from now
 * @returns Whether the run still holds the job
 */
export async function renewLease(db: Database, lease: JobLease, leaseMs: number): Promise<boolean> {
  const renewed = await db.update(generationJobs)
    .set({ leaseExpiresAt: sql`now() + ${`${leaseMs} milliseconds`}::interval`, updatedAt: sql`now()` })
    .where(held(lease)).returning({ id: generationJobs.id });
  return renewed.length > 0;
}

/**
 * Hands a still-held job back to the queue, for a worker shutting down cleanly; the next claim resumes it.
 * @param db - Database
 * @param lease - This run's lease
 */
export async function releaseLease(db: Database, lease: JobLease) {
  await db.update(generationJobs).set({ status: "queued", claimToken: null, leaseExpiresAt: null, updatedAt: sql`now()` })
    .where(held(lease)).returning({ id: generationJobs.id });
}

/**
 * The job control for one held lease, backed by Postgres.
 * @param db - Database
 * @param lease - This run's lease
 */
export function postgresControl(db: Database, lease: JobLease): GenerationControl {
  return {
    async progress(stage, slotId) {
      const updated = await db.update(generationJobs).set({ stage, currentSlotId: slotId, updatedAt: sql`now()` })
        .where(held(lease)).returning({ id: generationJobs.id });
      if (!updated.length) throw new LeaseLostError(lease.jobId);
    },
    async hold(transaction) {
      const [row] = await transaction.select({ id: generationJobs.id }).from(generationJobs).where(held(lease)).for("update");
      if (!row) throw new LeaseLostError(lease.jobId);
    },
    async settle(transaction, status) {
      const settled = await transaction.update(generationJobs)
        .set({ status, claimToken: null, leaseExpiresAt: null, updatedAt: sql`now()` })
        .where(held(lease)).returning({ id: generationJobs.id });
      if (!settled.length) throw new LeaseLostError(lease.jobId);
    },
  };
}
