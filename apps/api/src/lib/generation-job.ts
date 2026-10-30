import { hostname } from "node:os";
import { and, eq, sql } from "drizzle-orm";
import {
  generationJobs,
  pipelineEvents,
  usageRecords,
  type Database,
  type GenerationJobKind,
  type GenerationJobStatus,
  type GenerationStage,
  type Transaction,
} from "@senoy/db";

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
 * cancelled or reclaimed run never writes; `signal` stops its calls in flight too, so it does not wait for its stage to
 * end (SEN-93).
 */
export interface GenerationControl {
  /**
   * Aborted, with a `LeaseLostError` as its reason, once the worker learns the run no longer holds the job: the Learner
   * cancelled, or the lease lapsed and another worker took it. Model and research calls made under it stop at once.
   */
  readonly signal: AbortSignal;
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
 * The job belongs to this stack's `jobOwner()`, even when another stack queued it before. One upsert on the
 * (Request, kind) unique key, so it costs one round trip either way (SEN-102).
 * @param transaction - The transaction moving the Request
 * @param job - The Request, its Learner, and what the job produces
 */
export async function enqueueJob(transaction: Transaction, job: { courseRequestId: string; learnerId: string; kind: GenerationJobKind }) {
  await transaction.insert(generationJobs).values({ ...job, status: "queued", owner: jobOwner() }).onConflictDoUpdate({
    target: [generationJobs.courseRequestId, generationJobs.kind],
    set: { status: "queued", owner: jobOwner(), stage: null, currentSlotId: null, claimToken: null, leaseExpiresAt: null, updatedAt: new Date() },
  });
}

/** A fresh claim, with how the job came to it, for the worker's log (SEN-93). */
export type ClaimedJob = JobLease & {
  /** How many times the job has been claimed, this claim included. */
  claims: number;
  /** How long the job had been waiting: since it was queued or handed back, or since its last renewal when taken over. */
  waitedMs: number;
  /** When the job was taken over from a run whose lease lapsed, how long ago that lease ran out; else null. */
  lapsedMs: number | null;
};

/** The claim statement's row. */
type ClaimRow = Omit<ClaimedJob, "claimToken"> & { claimToken: string | null };

/**
 * Claims the oldest job of `owner` that is queued or whose lease lapsed, with a fresh claim token. Concurrent workers
 * skip rows another worker is claiming, so each job has one holder. A job queued before jobs had owners is claimed by
 * the first worker to see it and becomes that worker's, so it is never stranded. One statement: the row as it was
 * before the claim says how long the job waited, and whether its last run's lease had lapsed.
 * @param db - Database
 * @param leaseMs - How long the claim holds before it must be renewed
 * @param owner - Only jobs this stack queued (`jobOwner()`)
 * @returns The claim, or null when no job is waiting
 */
export async function claimGenerationJob(db: Database, leaseMs: number, owner: string): Promise<ClaimedJob | null> {
  const rows = await db.execute<ClaimRow>(sql`
    with claimable as (
      select ${generationJobs.id} as id, ${generationJobs.status} as was, ${generationJobs.leaseExpiresAt} as lapsed_at,
        ${generationJobs.updatedAt} as waiting_since
      from ${generationJobs}
      where (${generationJobs.owner} = ${owner} or ${generationJobs.owner} is null)
        and (${generationJobs.status} = 'queued' or (${generationJobs.status} = 'running' and ${generationJobs.leaseExpiresAt} < now()))
      order by ${generationJobs.createdAt}
      limit 1
      for update skip locked
    )
    update ${generationJobs} set
      status = 'running',
      owner = ${owner},
      claim_token = gen_random_uuid(),
      lease_expires_at = now() + ${`${leaseMs} milliseconds`}::interval,
      claims = ${generationJobs.claims} + 1,
      updated_at = now()
    from claimable
    where ${generationJobs.id} = claimable.id
    returning ${generationJobs.id} as "jobId", ${generationJobs.kind} as "kind", ${generationJobs.courseRequestId} as "courseRequestId",
      ${generationJobs.learnerId} as "learnerId", ${generationJobs.claimToken} as "claimToken", ${generationJobs.claims} as "claims",
      round(extract(epoch from now() - claimable.waiting_since) * 1000)::int as "waitedMs",
      case when claimable.was = 'running' then round(extract(epoch from now() - claimable.lapsed_at) * 1000)::int end as "lapsedMs"
  `);
  const [claimed] = rows;
  return claimed?.claimToken ? { ...claimed, claimToken: claimed.claimToken } : null;
}

/** What a step left open by a run that no longer holds its job is closed with. */
export const LEASE_LOST_ERROR = "[generation-job: closeAbandonedEvents] Lease lost: the run stopped before this step finished (its worker died, hung, or shut down)";

/**
 * Closes every Pipeline Event still `running` under a claim no running job holds any more: its run was killed, hung, or
 * shut down mid-step, or the Learner cancelled while it was down, so nothing else will ever close it (SEN-93). Each is
 * `failed` with `LEASE_LOST_ERROR`, finished at its last sign of life: its start, its latest child step, or its latest
 * Usage Record. A run that is alive but lost its job closes its steps itself when it stops, which overwrites this.
 * Steps the API ran have no claim and are never touched.
 * @param db - Database
 * @returns How many steps were closed
 */
export async function closeAbandonedEvents(db: Database): Promise<number> {
  const closed = await db.execute<{ id: string }>(sql`
    update ${pipelineEvents} as pe set
      status = 'failed',
      error = ${LEASE_LOST_ERROR},
      finished_at = greatest(
        pe.started_at,
        (select max(coalesce(child.finished_at, child.started_at)) from ${pipelineEvents} as child where child.parent_id = pe.id),
        (select max(used.created_at) from ${usageRecords} as used where used.pipeline_event_id = pe.id)
      )
    where pe.status = 'running' and pe.claim_token is not null
      and not exists (
        select 1 from ${generationJobs} as job where job.claim_token = pe.claim_token and job.status = 'running'
      )
    returning pe.id
  `);
  return closed.length;
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
 * The job control for one held lease, backed by Postgres. Once `signal` is aborted, every call throws its reason
 * without asking the database.
 * @param db - Database
 * @param lease - This run's lease
 * @param signal - Aborted by the worker with a `LeaseLostError` once it learns the run lost the job
 */
export function postgresControl(db: Database, lease: JobLease, signal: AbortSignal): GenerationControl {
  return {
    signal,
    async progress(stage, slotId) {
      signal.throwIfAborted();
      const updated = await db.update(generationJobs).set({ stage, currentSlotId: slotId, updatedAt: sql`now()` })
        .where(held(lease)).returning({ id: generationJobs.id });
      if (!updated.length) throw new LeaseLostError(lease.jobId);
    },
    async hold(transaction) {
      signal.throwIfAborted();
      const [row] = await transaction.select({ id: generationJobs.id }).from(generationJobs).where(held(lease)).for("update");
      if (!row) throw new LeaseLostError(lease.jobId);
    },
    async settle(transaction, status) {
      signal.throwIfAborted();
      const settled = await transaction.update(generationJobs)
        .set({ status, claimToken: null, leaseExpiresAt: null, updatedAt: sql`now()` })
        .where(held(lease)).returning({ id: generationJobs.id });
      if (!settled.length) throw new LeaseLostError(lease.jobId);
    },
  };
}
