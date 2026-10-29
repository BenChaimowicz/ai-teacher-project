import { hostname } from "node:os";
import { and, eq, sql } from "drizzle-orm";
import { generationJobs, type Database, type GenerationJobKind, type GenerationJobStatus, type GenerationStage, type Transaction } from "@senoy/db";

/** One worker's hold on one running job; every write the job makes is checked against `claimToken`. */
export type JobLease = {
  jobId: string;
  kind: GenerationJobKind;
  courseRequestId: string;
  learnerId: string;
  claimToken: string;
};

/** The worker and code a run executed on, recorded on its Pipeline Event so a run says what code it ran (SEN-92). */
export type WorkerIdentity = {
  host: string;
  /** The `jobOwner()` the worker claims for. */
  owner: string;
  /** `git rev-parse HEAD` when the run started; null outside a git checkout. */
  commit: string | null;
  /** Whether the checkout had uncommitted changes; null when unknown. */
  dirty: boolean | null;
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
export type SettledStatus = Extract<GenerationJobStatus, "succeeded" | "failed" | "needs_new_blueprint" | "interrupted">;

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
 * Whose stack queues and claims jobs here. The API stamps it on every job it queues and a worker claims only jobs with
 * its own, so developers sharing one database never run each other's jobs. `JOB_OWNER` when set; else, on Railway, the
 * environment id, which the API and worker services share; else this machine's hostname, which a developer's API and
 * worker share. Any other host that splits the API and worker must set the same `JOB_OWNER` on both.
 * @param env - Environment to read
 */
export function jobOwner(env: NodeJS.ProcessEnv = process.env): string {
  const owner = env.JOB_OWNER?.trim();
  if (owner) return owner;
  return env.RAILWAY_ENVIRONMENT_ID ? `railway:${env.RAILWAY_ENVIRONMENT_ID}` : hostname();
}

/**
 * Queues a Request's job of one kind: a fresh row, or its finished row again (Try again after a failed Blueprint).
 * Call it in the transaction that moves the Request to `blueprint_preparing` or `generating`, so the two never disagree.
 * The job belongs to this stack's `jobOwner()`, even when another stack queued it before.
 * @param transaction - The transaction moving the Request
 * @param job - The Request, its Learner, and what the job produces
 */
export async function enqueueJob(transaction: Transaction, job: { courseRequestId: string; learnerId: string; kind: GenerationJobKind }) {
  const [requeued] = await transaction.update(generationJobs)
    .set({ status: "queued", owner: jobOwner(), stage: null, currentSlotId: null, claimToken: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(generationJobs.courseRequestId, job.courseRequestId), eq(generationJobs.kind, job.kind)))
    .returning({ id: generationJobs.id });
  if (!requeued) await transaction.insert(generationJobs).values({ ...job, status: "queued", owner: jobOwner() });
}

/**
 * Claims the oldest job of `owner` that is queued or whose lease lapsed, with a fresh claim token. Concurrent workers
 * skip rows another worker is claiming, so each job has one holder. A job queued before jobs had owners is claimed by
 * the first worker to see it and becomes that worker's, so it is never stranded.
 * @param db - Database
 * @param leaseMs - How long the claim holds before it must be renewed
 * @param owner - Only jobs this stack queued (`jobOwner()`)
 * @returns The lease, or null when no job is waiting
 */
export async function claimGenerationJob(db: Database, leaseMs: number, owner: string): Promise<JobLease | null> {
  const next = sql`(
    select ${generationJobs.id} from ${generationJobs}
    where (${generationJobs.owner} = ${owner} or ${generationJobs.owner} is null)
      and (${generationJobs.status} = 'queued' or (${generationJobs.status} = 'running' and ${generationJobs.leaseExpiresAt} < now()))
    order by ${generationJobs.createdAt}
    limit 1
    for update skip locked
  )`;
  const [claimed] = await db.update(generationJobs).set({
    status: "running",
    owner,
    claimToken: sql`gen_random_uuid()`,
    leaseExpiresAt: sql`now() + ${`${leaseMs} milliseconds`}::interval`,
    claims: sql`${generationJobs.claims} + 1`,
    updatedAt: sql`now()`,
  }).where(eq(generationJobs.id, next)).returning({
    jobId: generationJobs.id,
    kind: generationJobs.kind,
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
