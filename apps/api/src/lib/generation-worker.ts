import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { courseBlueprints, type Database } from "@senoy/db";
import type { BlueprintJob } from "./blueprint-job.ts";
import type { CourseGeneration } from "./course-generation.ts";
import {
  claimGenerationJob,
  closeAbandonedEvents,
  jobOwner,
  LeaseLostError,
  postgresControl,
  releaseLease,
  renewLease,
  type ClaimedJob,
  type JobLease,
  type WorkerIdentity,
} from "./generation-job.ts";
import { withClaim } from "./usage-tracking.ts";

/** Where the worker reports; pino's logger fits. */
export type WorkerLog = { info(message: string): void; error(message: string): void };

/** Worker timing; a crashed worker's job is reclaimed once its lease lapses. */
export type GenerationWorkerOptions = {
  db: Database;
  /** Runs `blueprint` jobs. */
  blueprint: BlueprintJob;
  /** Runs `course` jobs. */
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
 * A claim or renewal takes about 100 ms. One still pending after this long is stuck, most likely a query the Supabase
 * pooler lost (SEN-70), and is logged so the worker never goes quiet without saying why (SEN-93).
 */
const SLOW_QUERY_MS = 10_000;

const execFileAsync = promisify(execFile);

/**
 * This host and the git commit its checkout is on, read when each job starts: `tsx watch` does not restart the worker
 * on a commit or a checkout that leaves its files unchanged, so the commit at startup could be stale. A Railway deploy
 * has no checkout; its commit comes from `RAILWAY_GIT_COMMIT_SHA`.
 * @param owner - The owner the worker claims for
 */
async function gitIdentity(owner: string): Promise<WorkerIdentity> {
  /** One git command's trimmed output, or null when git or the checkout is missing. */
  const git = (...args: string[]) => execFileAsync("git", args, { timeout: 5_000 }).then(({ stdout }) => stdout.trim(), () => null);
  const [commit, status] = await Promise.all([git("rev-parse", "HEAD"), git("status", "--porcelain", "--untracked-files=no")]);
  return { host: hostname(), owner, commit: commit ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? null, dirty: status === null ? null : status !== "" };
}

/**
 * The Node worker's job loop (spec §2, §5.1): claims one job from Postgres, keeps its lease alive, and runs it: Blueprint
 * design for a `blueprint` job, full-Course generation against the stored approved Blueprint for a `course` job. The
 * browser never talks to it. It claims only jobs queued under its own `jobOwner()`.
 * @param options - Database, job runners, log, and timing
 */
export function createGenerationWorker({ db, blueprint, generation, log, pollMs = POLL_MS, leaseMs = LEASE_MS }: GenerationWorkerOptions): GenerationWorker {
  const owner = jobOwner();
  let stopping = false;
  let current: JobLease | null = null;
  const wake = new AbortController();

  /**
   * Awaits one of the worker's own queries, logging it once if it is still pending after `SLOW_QUERY_MS`.
   * @param what - The query, for the log
   * @param facts - `k=v` facts for the log
   * @param query - The pending query
   */
  async function unlessStuck<T>(what: string, facts: string, query: Promise<T>): Promise<T> {
    const timer = setTimeout(() => log.error(`[generation-worker: ${what}] Still waiting on the database after ${SLOW_QUERY_MS / 1000} s || ${facts}`), SLOW_QUERY_MS);
    try {
      return await query;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Runs one claimed job to its end, or until the run loses its lease. The heartbeat renews the lease; once a renewal
   * finds the job gone (Cancel, or another worker took it), it aborts the run's calls in flight, so the worker is free
   * within a third of the lease instead of when the stage ends (SEN-93).
   */
  async function runJob(claim: ClaimedJob) {
    const lost = new AbortController();
    let renewing = false;
    const heartbeat = setInterval(() => {
      // A renewal still pending is stuck; another one would only queue behind it.
      if (renewing || lost.signal.aborted) return;
      renewing = true;
      unlessStuck("heartbeat", `jobId=${claim.jobId}`, renewLease(db, claim, leaseMs)).then((holds) => {
        if (holds) return;
        log.info(`job ${claim.jobId} is no longer held by this worker; stopping its calls`);
        lost.abort(new LeaseLostError(claim.jobId));
      }).catch((error: unknown) => log.error(`[generation-worker: heartbeat] Lease renewal failed || jobId=${claim.jobId} || ${describe(error)}`))
        .finally(() => { renewing = false; });
    }, Math.max(1, Math.floor(leaseMs / 3)));
    try {
      const worker = await gitIdentity(owner);
      const came = claim.lapsedMs === null ? `waited ${seconds(claim.waitedMs)} in the queue` : `took over a lease that lapsed ${seconds(claim.lapsedMs)} ago`;
      log.info(`${claim.kind} job ${claim.jobId} claimed for Request ${claim.courseRequestId} || ${came}, claim ${claim.claims} || ` +
        `owner=${owner} host=${worker.host} commit=${worker.commit}${worker.dirty ? " (uncommitted changes)" : ""}`);
      const input = { db, courseRequestId: claim.courseRequestId, learnerId: claim.learnerId, control: postgresControl(db, claim, lost.signal), worker };
      // Every Pipeline Event the run starts keeps this claim, so a later claim can close what it leaves open.
      await withClaim(claim.claimToken, async () => {
        if (claim.kind === "blueprint") {
          await blueprint.start(input);
          log.info(`job ${claim.jobId} saved its Course Blueprint for review`);
          return;
        }
        const [stored] = await db.select({ approved: courseBlueprints.approved }).from(courseBlueprints)
          .where(eq(courseBlueprints.courseRequestId, claim.courseRequestId)).limit(1);
        if (!stored?.approved) throw new Error(`[generation-worker: run] Request has no approved Blueprint || requestId=${claim.courseRequestId}`);
        await generation.start({ ...input, approved: stored.approved });
        log.info(`job ${claim.jobId} published its Course`);
      });
    } catch (error) {
      if (error instanceof LeaseLostError) log.info(`job ${claim.jobId} stopped: cancelled or claimed elsewhere`);
      else log.error(`[generation-worker: run] Generation stopped || jobId=${claim.jobId} || ${describe(error)}`);
    } finally {
      clearInterval(heartbeat);
    }
  }

  /** Closes the Pipeline Events of runs that stopped mid-step; a failure is logged and never holds up the job. */
  async function closeAbandoned() {
    try {
      const closed = await unlessStuck("closeAbandoned", `owner=${owner}`, closeAbandonedEvents(db));
      if (closed) log.info(`closed ${closed} Pipeline Event${closed === 1 ? "" : "s"} left running by a run that lost its lease`);
    } catch (error) {
      log.error(`[generation-worker: closeAbandoned] Closing abandoned Pipeline Events failed || ${describe(error)}`);
    }
  }

  return {
    async run() {
      log.info(`claiming jobs queued by ${owner}`);
      while (!stopping) {
        try {
          const claim = await unlessStuck("claim", `owner=${owner}`, claimGenerationJob(db, leaseMs, owner));
          current = claim;
          if (claim) {
            await closeAbandoned();
            await runJob(claim);
          } else await sleep(pollMs, undefined, { signal: wake.signal }).catch(() => undefined);
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

/** A duration for the log, such as `2.1 s`. */
function seconds(ms: number) {
  return `${(ms / 1000).toFixed(1)} s`;
}
