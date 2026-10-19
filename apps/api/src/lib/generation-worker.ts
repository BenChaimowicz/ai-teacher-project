import { setTimeout as sleep } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { courseBlueprints, type Database } from "@senoy/db";
import type { CourseGeneration } from "./course-generation.ts";
import { claimGenerationJob, LeaseLostError, postgresControl, releaseLease, renewLease, type JobLease } from "./generation-job.ts";

/** Where the worker reports; pino's logger fits. */
export type WorkerLog = { info(message: string): void; error(message: string): void };

/** Worker timing; a crashed worker's job is reclaimed once its lease lapses. */
export type GenerationWorkerOptions = {
  db: Database;
  generation: CourseGeneration;
  log: WorkerLog;
  /** How long to wait before looking again when no job is queued. */
  pollMs?: number;
  /** How long a claim holds without renewal. */
  leaseMs?: number;
};

/** A running worker loop. */
export interface GenerationWorker {
  /** Claims and runs jobs one at a time until stopped. */
  run(): Promise<void>;
  /** Stops claiming and hands a job still in progress back to the queue. */
  stop(): Promise<void>;
}

/** Default wait between empty polls. */
const POLL_MS = 2_000;

/** Default lease; renewed every third of it, so a crash is noticed within about a minute. */
const LEASE_MS = 60_000;

/**
 * The Node worker's job loop (spec §2, §5.1): claims one generation job from Postgres, keeps its lease alive, and runs
 * full-Course generation against the stored approved Blueprint. The browser never talks to it.
 * @param options - Database, generation, log, and timing
 */
export function createGenerationWorker({ db, generation, log, pollMs = POLL_MS, leaseMs = LEASE_MS }: GenerationWorkerOptions): GenerationWorker {
  let stopping = false;
  let current: JobLease | null = null;
  const wake = new AbortController();

  /** Runs one claimed job to its end, or until the run loses its lease. */
  async function runJob(lease: JobLease) {
    const heartbeat = setInterval(() => {
      renewLease(db, lease, leaseMs).then((holds) => {
        if (!holds) log.info(`job ${lease.jobId} is no longer held by this worker; it stops at its next stage`);
      }).catch((error: unknown) => log.error(`[generation-worker: heartbeat] Lease renewal failed || jobId=${lease.jobId} || ${describe(error)}`));
    }, Math.max(1, Math.floor(leaseMs / 3)));
    try {
      const [blueprint] = await db.select({ approved: courseBlueprints.approved }).from(courseBlueprints)
        .where(eq(courseBlueprints.courseRequestId, lease.courseRequestId)).limit(1);
      if (!blueprint?.approved) throw new Error(`[generation-worker: run] Request has no approved Blueprint || requestId=${lease.courseRequestId}`);
      log.info(`job ${lease.jobId} claimed for Request ${lease.courseRequestId}`);
      await generation.start({
        db, courseRequestId: lease.courseRequestId, learnerId: lease.learnerId, approved: blueprint.approved, control: postgresControl(db, lease),
      });
      log.info(`job ${lease.jobId} published its Course`);
    } catch (error) {
      if (error instanceof LeaseLostError) log.info(`job ${lease.jobId} stopped: cancelled or claimed elsewhere`);
      else log.error(`[generation-worker: run] Generation stopped || jobId=${lease.jobId} || ${describe(error)}`);
    } finally {
      clearInterval(heartbeat);
    }
  }

  return {
    async run() {
      while (!stopping) {
        try {
          current = await claimGenerationJob(db, leaseMs);
          if (current) await runJob(current);
          else await sleep(pollMs, undefined, { signal: wake.signal }).catch(() => undefined);
        } catch (error) {
          log.error(`[generation-worker: run] Claiming a job failed || ${describe(error)}`);
          await sleep(pollMs, undefined, { signal: wake.signal }).catch(() => undefined);
        } finally {
          current = null;
        }
      }
    },
    async stop() {
      stopping = true;
      wake.abort();
      if (current) await releaseLease(db, current);
    },
  };
}

/** One line for a caught value. */
function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
