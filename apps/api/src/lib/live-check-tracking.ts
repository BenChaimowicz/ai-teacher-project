import { createDb, DEFAULT_POOL_SIZE, loadRootEnv } from "@senoy/db";
import { drizzleUsageSink, installUsageTracking, withPipelineEvent, type TrackingLog, type UsageSink } from "./usage-tracking.ts";

/**
 * A sink for live checks. A live check's Course Requests and Learners live in its own local database, or in a
 * transaction it rolls back, so their ids do not exist in the shared database and would fail its foreign keys: Pipeline
 * Events keep no link to them, and Product Events (actions of a Learner who never existed there) are not stored.
 * @param sink - The sink that does the writing
 */
export function liveCheckSink(sink: UsageSink): UsageSink {
  return {
    ...sink,
    startPipelineEvent: (row) => sink.startPipelineEvent({ ...row, courseRequestId: null, learnerId: null }),
    insertProductEvent: async () => {},
  };
}

/** Where a live check's tracking failures go: stderr, so a missing record is seen. */
const stderrLog: TrackingLog = { error: (message) => process.stderr.write(`${message}\n`) };

/** Hosts that mean a database on this machine, such as the live checks' Docker Postgres. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

/**
 * The shared database a live check's Usage Records go to: `USAGE_DATABASE_URL`. Live checks run their own reads and
 * writes against a local Docker database (`DATABASE_URL`), but their spend is real and belongs with the platform's.
 * @param env - Environment to read
 * @returns The connection URL
 * @throws Error if it is not set, or points at this machine, where the records would be thrown away with the container
 */
export function usageDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const url = env.USAGE_DATABASE_URL?.trim();
  if (!url) {
    throw new Error("[live-check-tracking: usageDatabaseUrl] USAGE_DATABASE_URL is required: live checks record their paid calls in the shared database || USAGE_DATABASE_URL=unset");
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[live-check-tracking: usageDatabaseUrl] USAGE_DATABASE_URL is not a URL || ${message}`);
  }
  if (LOCAL_HOSTS.has(host)) {
    throw new Error(`[live-check-tracking: usageDatabaseUrl] USAGE_DATABASE_URL must be the shared database, not a local one || host=${host}`);
  }
  return url;
}

/**
 * Runs one live check with usage tracking on, so every paid call it makes is a Usage Record in the shared database
 * (`USAGE_DATABASE_URL`) under a `live_check` Pipeline Event labelled with the check's name, like the API and worker
 * record theirs. The check itself keeps using `DATABASE_URL`. Research calls are stored at their estimated cost; they
 * are not measured against the vendor balance, because the check ends before a balance read is final.
 * @param name - The check's `pnpm` script, e.g. `check:reading:live`
 * @param fn - The check
 * @returns What the check returns
 * @throws Error if `USAGE_DATABASE_URL` is missing or local; the check's own error is rethrown untouched
 */
export async function withLiveCheckTracking<T>(name: string, fn: () => Promise<T>): Promise<T> {
  loadRootEnv(import.meta.url, 4);
  const url = usageDatabaseUrl(process.env);
  // Parallel research slots record at once; enough connections that none is pipelined onto a busy one (SEN-70).
  const db = createDb(url, { max: DEFAULT_POOL_SIZE });
  const uninstall = installUsageTracking({ sink: liveCheckSink(drizzleUsageSink(db)), log: stderrLog });
  try {
    return await withPipelineEvent("live_check", { label: name }, () => fn());
  } finally {
    uninstall();
    await db.$client.end();
  }
}
