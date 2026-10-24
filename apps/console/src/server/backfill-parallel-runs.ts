import { sql } from "drizzle-orm";
import { createDb, loadRootEnv, pipelineEvents, usageRecords, type Database } from "@senoy/db";
import { RESEARCH_LIST_PRICES_USD } from "@senoy/research";

/** The parts of a stored Source pack this backfill reads. */
export type StoredPack = {
  slot: "primary" | "secondary";
  adapter: string;
  topic: string;
  status: string;
  startedAt: string;
  latencyMs: number;
  vendorRequestId: string | null;
  vendorSummary: string | null;
  sources: unknown[];
};

/** Parallel's record of one Task run, as `GET /v1/tasks/runs/{id}` returns it. */
export type ParallelRun = {
  run_id: string;
  status: string;
  processor: string;
  created_at: string;
  modified_at: string;
};

/** Source pack statuses that mean the vendor answered, mapped to Usage Record outcomes. */
const ANSWERED: Record<string, "ok" | "empty_vendor" | "empty_filtered"> = { ok: "ok", empty_vendor: "empty_vendor", empty_filtered: "empty_filtered" };

/**
 * Builds the backfilled Usage Record for one stored Parallel pack and Parallel's record of its run. Parallel bills a
 * run that completed, at the processor's fixed price, and nothing for a failed run (SEN-72), so the cost follows the
 * run's status, not what our client saw (a run we timed out on may still have completed and been billed).
 * @param pack - The stored Source pack
 * @param run - Parallel's record of the run
 * @param pipelineEventId - The backfilled research step it belongs to
 * @returns The row to insert
 */
export function backfillRow(pack: StoredPack, run: ParallelRun, pipelineEventId: string): typeof usageRecords.$inferInsert {
  const billed = run.status === "completed";
  const createdAt = new Date(run.modified_at);
  return {
    pipelineEventId,
    vendor: "parallel",
    role: pack.slot === "primary" ? "research_primary" : "research_secondary",
    modelId: "parallel-pro",
    responseId: run.run_id,
    attempt: 1,
    outcome: ANSWERED[pack.status] ?? (pack.status === "timed_out" ? "timeout" : "error"),
    costUsd: billed ? RESEARCH_LIST_PRICES_USD["parallel-pro"] : 0,
    costBasis: "estimated",
    measurementNote: billed
      ? `Backfilled: Parallel reports this ${run.processor} run completed, so it was billed at list price`
      : `Backfilled: Parallel reports this run ${run.status}; failed runs are not billed`,
    origin: "backfill",
    request: { topic: pack.topic, adapter: pack.adapter, backfilledFrom: "lesson_research" },
    response: { run, summary: pack.vendorSummary, sourceCount: pack.sources.length },
    createdAt,
    durationMs: Math.max(0, createdAt.getTime() - new Date(run.created_at).getTime()),
  };
}

/**
 * Looks up one Parallel run by id.
 * @param runId - `trun_…`
 * @param apiKey - `PARALLEL_PRO_API_KEY`
 * @returns Parallel's record of the run
 * @throws Error when the lookup fails
 */
async function lookUpRun(runId: string, apiKey: string): Promise<ParallelRun> {
  try {
    const response = await fetch(`https://api.parallel.ai/v1/tasks/runs/${encodeURIComponent(runId)}`, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`status=${response.status}`);
    return (await response.json()) as ParallelRun;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[backfill-parallel-runs: lookUpRun] Run lookup failed || runId=${runId} || ${message}`);
  }
}

/**
 * One-off backfill: every Parallel run stored in `lesson_research` that is not yet a Usage Record is looked up at
 * Parallel and saved as a `backfill` Usage Record under a backfilled `research` Pipeline Event for its Course Request
 * and slot. Safe to run again: runs already recorded are skipped.
 * @param db - Database
 * @param apiKey - `PARALLEL_PRO_API_KEY`
 * @param log - Progress lines
 * @returns How many runs were saved, and how many lookups failed
 */
export async function backfillParallelRuns(db: Database, apiKey: string, log: (line: string) => void) {
  const rows = (await db.execute(sql`
    select lr.course_request_id as "courseRequestId", lr.slot_id as "slotId", lr.source_packs as "packs", cr.learner_id as "learnerId"
    from lesson_research lr join course_requests cr on cr.id = lr.course_request_id
    order by lr.researched_at`)) as unknown as { courseRequestId: string; slotId: string; packs: StoredPack[]; learnerId: string }[];
  const known = new Set(
    ((await db.execute(sql`select response_id from usage_records where vendor = 'parallel' and response_id is not null`)) as unknown as { response_id: string }[])
      .map((row) => row.response_id),
  );
  let saved = 0;
  let failed = 0;
  for (const row of rows) {
    const packs = row.packs.filter((pack) => pack.adapter === "parallel-pro" && pack.vendorRequestId && !known.has(pack.vendorRequestId));
    if (packs.length === 0) continue;
    for (const pack of packs) {
      let run: ParallelRun;
      try {
        run = await lookUpRun(pack.vendorRequestId!, apiKey);
      } catch (error) {
        failed += 1;
        log(error instanceof Error ? error.message : String(error));
        continue;
      }
      const startedAt = new Date(run.created_at);
      const finishedAt = new Date(run.modified_at);
      const [event] = await db.insert(pipelineEvents).values({
        kind: "research",
        label: `${row.slotId} research (backfilled)`,
        courseRequestId: row.courseRequestId,
        learnerId: row.learnerId,
        status: run.status === "completed" ? "ok" : "failed",
        error: run.status === "completed" ? null : `Parallel run ${run.status}`,
        detail: { backfilled: true, slotId: row.slotId, slot: pack.slot },
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      }).returning({ id: pipelineEvents.id });
      await db.insert(usageRecords).values(backfillRow(pack, run, event!.id));
      known.add(run.run_id);
      saved += 1;
      log(`saved ${run.run_id} · ${run.status} · ${row.slotId} · ${run.created_at}`);
    }
  }
  return { saved, failed };
}

/** Runs the backfill against the configured database when this file is executed directly. */
async function main() {
  loadRootEnv(import.meta.url, 4);
  const url = process.env.DATABASE_URL;
  const apiKey = process.env.PARALLEL_PRO_API_KEY?.trim();
  if (!url || !apiKey) throw new Error("[backfill-parallel-runs: main] DATABASE_URL and PARALLEL_PRO_API_KEY are required");
  const db = createDb(url, { max: 1 });
  const result = await backfillParallelRuns(db, apiKey, (line) => process.stdout.write(`${line}\n`));
  process.stdout.write(`done · saved=${result.saved} · failed=${result.failed}\n`);
  process.exit(0);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("backfill-parallel-runs.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
