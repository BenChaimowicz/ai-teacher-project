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
  jobOwner,
  LeaseLostError,
  postgresControl,
  releaseLease,
  renewLease,
  type JobLease,
  type WorkerIdentity,
} from "./generation-job.ts";

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

  /** Runs one claimed job to its end, or until the run loses its lease. */
  async function runJob(lease: JobLease) {
    const heartbeat = setInterval(() => {
      renewLease(db, lease, leaseMs).then((holds) => {
        if (!holds) log.info(`job ${lease.jobId} is no longer held by this worker; it stops at its next stage`);
      }).catch((error: unknown) => log.error(`[generation-worker: heartbeat] Lease renewal failed || jobId=${lease.jobId} || ${describe(error)}`));
    }, Math.max(1, Math.floor(leaseMs / 3)));
    try {
      const worker = await gitIdentity(owner);
      log.info(`${lease.kind} job ${lease.jobId} claimed for Request ${lease.courseRequestId} || commit=${worker.commit}${worker.dirty ? " (uncommitted changes)" : ""}`);
      const input = { db, courseRequestId: lease.courseRequestId, learnerId: lease.learnerId, control: postgresControl(db, lease), worker };
      if (lease.kind === "blueprint") {
        await blueprint.start(input);
        log.info(`job ${lease.jobId} saved its Course Blueprint for review`);
        return;
      }
      const [stored] = await db.select({ approved: courseBlueprints.approved }).from(courseBlueprints)
        .where(eq(courseBlueprints.courseRequestId, lease.courseRequestId)).limit(1);
      if (!stored?.approved) throw new Error(`[generation-worker: run] Request has no approved Blueprint || requestId=${lease.courseRequestId}`);
      await generation.start({ ...input, approved: stored.approved });
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
      log.info(`claiming jobs queued by ${owner}`);
      while (!stopping) {
        try {
          current = await claimGenerationJob(db, leaseMs, owner);
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
