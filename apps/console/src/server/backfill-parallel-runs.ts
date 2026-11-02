import { eq, sql } from "drizzle-orm";
import { createDb, loadRootEnv, pipelineEvents, usageRecords, type Database } from "@senoy/db";
import { RESEARCH_LIST_PRICES_USD, type ResearchAdapterId } from "@senoy/research";

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

/** The research adapters that run on Parallel's Task API. */
const PARALLEL_ADAPTERS = new Set<string>(["parallel-pro", "parallel-core"]);

/**
 * List price of one run for a Parallel adapter id.
 * @param adapter - `parallel-pro` or `parallel-core`
 */
function listPrice(adapter: string) {
  return RESEARCH_LIST_PRICES_USD[adapter as ResearchAdapterId] ?? RESEARCH_LIST_PRICES_USD["parallel-pro"];
}

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
    modelId: pack.adapter,
    responseId: run.run_id,
    attempt: 1,
    outcome: ANSWERED[pack.status] ?? (pack.status === "timed_out" ? "timeout" : "error"),
    costUsd: billed ? listPrice(pack.adapter) : 0,
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
 * The price for a live Usage Record of a Parallel call that errored at our end, which was saved at $0 (SEN-72), once
 * Parallel says whether the run completed anyway (SEN-126: the run keeps going after our connection drops).
 * @param record - The errored record: its adapter id and any balance-measurement note it already has
 * @param run - Parallel's record of the run
 * @returns The new cost and note when the run was billed, or null when it was not and the record stays at $0
 */
export function repricedError(record: { modelId: string; measurementNote: string | null }, run: ParallelRun) {
  if (run.status !== "completed") return null;
  const note = `Repriced: Parallel reports this ${run.processor} run completed after the call errored, so it was billed at list price`;
  return { costUsd: listPrice(record.modelId), measurementNote: record.measurementNote ? `${record.measurementNote} · ${note}` : note };
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
 * Backfill: every Parallel run stored in `lesson_research` that is not yet a Usage Record is looked up at Parallel and
 * saved as a `backfill` Usage Record under a backfilled `research` Pipeline Event for its Course Request and slot.
 * Then every live Usage Record of a Parallel call that errored at $0 with a run id is looked up, and repriced at list
 * price when the run completed anyway. Safe to run again: runs already recorded are skipped, and a repriced record is
 * no longer at $0.
 * @param db - Database
 * @param apiKey - `PARALLEL_PRO_API_KEY`
 * @param log - Progress lines
 * @returns How many runs were saved, how many errored records were repriced, and how many lookups failed
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
    const packs = row.packs.filter((pack) => PARALLEL_ADAPTERS.has(pack.adapter) && pack.vendorRequestId && !known.has(pack.vendorRequestId));
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
  const errored = (await db.execute(sql`
    select id, model_id as "modelId", response_id as "responseId", measurement_note as "measurementNote" from usage_records
    where vendor = 'parallel' and origin = 'captured' and outcome = 'error' and response_id is not null and coalesce(cost_usd, 0) = 0
    order by created_at`)) as unknown as { id: string; modelId: string; responseId: string; measurementNote: string | null }[];
  let repriced = 0;
  for (const record of errored) {
    let run: ParallelRun;
    try {
      run = await lookUpRun(record.responseId, apiKey);
    } catch (error) {
      failed += 1;
      log(error instanceof Error ? error.message : String(error));
      continue;
    }
    const price = repricedError(record, run);
    if (!price) continue;
    await db.update(usageRecords).set(price).where(eq(usageRecords.id, record.id));
    repriced += 1;
    log(`repriced ${run.run_id} · ${run.status} · $${price.costUsd}`);
  }
  return { saved, repriced, failed };
}

/** Runs the backfill against the configured database when this file is executed directly. */
async function main() {
  loadRootEnv(import.meta.url, 4);
  const url = process.env.DATABASE_URL;
  const apiKey = process.env.PARALLEL_PRO_API_KEY?.trim();
  if (!url || !apiKey) throw new Error("[backfill-parallel-runs: main] DATABASE_URL and PARALLEL_PRO_API_KEY are required");
  const db = createDb(url, { max: 1 });
  const result = await backfillParallelRuns(db, apiKey, (line) => process.stdout.write(`${line}\n`));
  process.stdout.write(`done · saved=${result.saved} · repriced=${result.repriced} · failed=${result.failed}\n`);
  process.exit(0);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("backfill-parallel-runs.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
