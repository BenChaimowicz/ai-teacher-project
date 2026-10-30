import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  apiRequests,
  RESEARCH_ADAPTER_VENDORS,
  pipelineEvents,
  productEvents,
  usageRecords,
  type CostBasis,
  type Database,
  type PipelineEventKind,
  type PipelineEventStatus,
  type ProductEventKind,
  type ResearchUsageRequest,
  type UsageOutcome,
  type UsageRole,
  type UsageVendor,
} from "@senoy/db";
import type { ResearchAdapter, ResearchAdapterId, ResearchCallObservation, ResearchOptions, SourcePackStatus } from "@senoy/research";
import { createOpenRouterTransport, type ModelCallObservation, type OpenRouterOptions, type StructuredTransport } from "./openrouter.ts";
import type { MeasuredCall, MeasuredVendor, Measurement, ResearchMeter } from "./research-measurement.ts";

/**
 * Usage tracking (ADR 0008): Pipeline Events, Usage Records, Product Events, and API Requests, written to the
 * platform's own Postgres. One process-wide sink is installed at startup; until then every call here is a no-op, so
 * unit tests and live checks write nothing. A tracking write never throws into, or fails, the step it records.
 */

/** Where tracking reports its own failures; Fastify's and pino's loggers fit. */
export type TrackingLog = { error(message: string): void };

/** A Usage Record row as tracking writes it; the Pipeline Event comes from the current context. */
export type UsageRecordRow = Omit<typeof usageRecords.$inferInsert, "id" | "pipelineEventId" | "createdAt">;

/** A Pipeline Event as it starts. */
export type PipelineEventStart = {
  parentId: string | null;
  kind: PipelineEventKind;
  label: string | null;
  courseRequestId: string | null;
  learnerId: string | null;
  detail: Record<string, unknown> | null;
  /** The job claim the step runs under (`withClaim`); null outside a worker's run. */
  claimToken: string | null;
};

/** How a Pipeline Event ended. */
export type PipelineEventFinish = {
  status: Exclude<PipelineEventStatus, "running">;
  error: string | null;
  detail: Record<string, unknown> | null;
  finishedAt: Date;
  durationMs: number;
};

/** A Product Event row. */
export type ProductEventRow = { kind: ProductEventKind; learnerId: string | null; courseRequestId: string | null; detail: unknown };

/** An API Request row. */
export type ApiRequestRow = Omit<typeof apiRequests.$inferInsert, "id" | "createdAt">;

/** The writes tracking makes. Production uses `drizzleUsageSink`; tests pass a fake. */
export type UsageSink = {
  /** Inserts a `running` Pipeline Event and returns its id. */
  startPipelineEvent(row: PipelineEventStart): Promise<string>;
  finishPipelineEvent(id: string, row: PipelineEventFinish): Promise<void>;
  insertUsageRecord(row: UsageRecordRow & { id: string; pipelineEventId: string | null }): Promise<void>;
  /** Writes a research call's measured cost once its balance reads are final. */
  setUsageMeasurement(id: string, measurement: Measurement): Promise<void>;
  insertProductEvent(row: ProductEventRow): Promise<void>;
  insertApiRequest(row: ApiRequestRow): Promise<void>;
};

/** The Course Request, Learner, innermost Pipeline Event, and job claim the current code runs for. */
export type TrackingContext = { pipelineEventId: string | null; courseRequestId: string | null; learnerId: string | null; claimToken: string | null };

/** Which model port and which of its attempts is calling the transport (ADR 0015). */
export type ModelCallFrame = { role: Extract<UsageRole, "generator" | "fallback_generator" | "judge">; attempt: number };

/** The installed sink and research meter, or null when tracking is off. */
let installed: { sink: UsageSink; log: TrackingLog; meter: ResearchMeter | null } | null = null;

const contextStorage = new AsyncLocalStorage<TrackingContext>();
const modelCallStorage = new AsyncLocalStorage<ModelCallFrame>();

/**
 * The sink that writes to the platform's Postgres through Drizzle.
 * @param db - Drizzle client
 */
export function drizzleUsageSink(db: Database): UsageSink {
  return {
    async startPipelineEvent(row) {
      const [created] = await db.insert(pipelineEvents).values({ ...row, status: "running" }).returning({ id: pipelineEvents.id });
      if (!created) throw new Error("Pipeline Event insert returned no row");
      return created.id;
    },
    async finishPipelineEvent(id, row) {
      await db.update(pipelineEvents).set(row).where(eq(pipelineEvents.id, id));
    },
    async insertUsageRecord(row) {
      await db.insert(usageRecords).values(row);
    },
    async setUsageMeasurement(id, measurement) {
      await db.update(usageRecords).set(measurement).where(eq(usageRecords.id, id));
    },
    async insertProductEvent(row) {
      await db.insert(productEvents).values(row);
    },
    async insertApiRequest(row) {
      await db.insert(apiRequests).values(row);
    },
  };
}

/**
 * Turns tracking on for this process. Call once at startup, after the database is ready.
 * @param options.db - Drizzle client; used when no `sink` is given
 * @param options.sink - A custom sink (tests)
 * @param options.log - Where tracking failures are logged
 * @param options.meter - Measures research calls against vendor balances; without it they are not measured
 * @returns A function that turns tracking off again (tests)
 */
export function installUsageTracking(options: { db?: Database; sink?: UsageSink; log: TrackingLog; meter?: ResearchMeter }): () => void {
  const sink = options.sink ?? (options.db ? drizzleUsageSink(options.db) : null);
  if (!sink) throw new Error("[usage-tracking: installUsageTracking] Pass a db or a sink");
  const current = { sink, log: options.log, meter: options.meter ?? null };
  installed = current;
  return () => {
    if (installed === current) installed = null;
  };
}

/** The current tracking context, if any step set one. */
export function currentTrackingContext(): TrackingContext | undefined {
  return contextStorage.getStore();
}

/**
 * Runs one claimed job's run so every Pipeline Event it starts keeps the claim's token. Once no running job holds that
 * token, the next claim closes whatever the run left open (SEN-93).
 * @param claimToken - The run's claim token
 * @param fn - The run
 */
export function withClaim<T>(claimToken: string, fn: () => Promise<T>): Promise<T> {
  return contextStorage.run({ pipelineEventId: null, courseRequestId: null, learnerId: null, claimToken }, fn);
}

/**
 * One line for a caught value.
 * @param error - Anything thrown
 */
function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs one tracking write, logging and swallowing any failure.
 * @param where - Function name, for the log
 * @param facts - `k=v` facts for the log
 * @param write - The write
 */
async function safely<T>(where: string, facts: string, write: (sink: UsageSink) => Promise<T>): Promise<T | undefined> {
  const current = installed;
  if (!current) return undefined;
  try {
    return await write(current.sink);
  } catch (error) {
    try {
      current.log.error(`[usage-tracking: ${where}] Tracking write failed || ${facts} || ${describe(error)}`);
    } catch {
      // A broken logger must not fail the caller either.
    }
    return undefined;
  }
}

/** What a step may say about itself while it runs. */
export type PipelineEventScope = {
  /** The event id; null when tracking is off or its insert failed. */
  readonly id: string | null;
  /** Merges facts into the event's `detail`, written when the step ends. Never credentials. */
  setDetail(detail: Record<string, unknown>): void;
};

/** Options for one Pipeline Event. Course Request and Learner default to the enclosing step's. */
export type PipelineEventOptions = {
  label?: string;
  courseRequestId?: string;
  learnerId?: string;
  detail?: Record<string, unknown>;
};

/**
 * Records one platform step as a Pipeline Event around `fn`: `running` when it starts, then `ok` or `failed` with its
 * error, duration, and detail. Nested steps and Usage Records made inside `fn` attach to it. The original error is
 * rethrown untouched, and a tracking failure never stops `fn` from running.
 * @param kind - Which step
 * @param options - Label, Course Request, Learner, and starting detail
 * @param fn - The step
 */
export async function withPipelineEvent<T>(
  kind: PipelineEventKind,
  options: PipelineEventOptions,
  fn: (event: PipelineEventScope) => Promise<T>,
): Promise<T> {
  let detail: Record<string, unknown> | null = options.detail ? { ...options.detail } : null;
  const scope = (id: string | null): PipelineEventScope => ({
    id,
    setDetail(more) {
      detail = { ...detail, ...more };
    },
  });
  if (!installed) return fn(scope(null));
  const parent = contextStorage.getStore();
  const courseRequestId = options.courseRequestId ?? parent?.courseRequestId ?? null;
  const learnerId = options.learnerId ?? parent?.learnerId ?? null;
  const claimToken = parent?.claimToken ?? null;
  const facts = `kind=${kind} || courseRequestId=${courseRequestId}`;
  const id = await safely("withPipelineEvent", facts, (sink) => sink.startPipelineEvent({
    parentId: parent?.pipelineEventId ?? null, kind, label: options.label ?? null, courseRequestId, learnerId, detail, claimToken,
  })) ?? null;
  // Without an id, records made inside still attach to the enclosing step.
  const context = { pipelineEventId: id ?? parent?.pipelineEventId ?? null, courseRequestId, learnerId, claimToken };
  const startedAt = performance.now();
  const finish = async (status: PipelineEventFinish["status"], error: string | null) => {
    if (!id) return;
    await safely("withPipelineEvent", `${facts} || eventId=${id}`, (sink) => sink.finishPipelineEvent(id, {
      status, error, detail, finishedAt: new Date(), durationMs: Math.round(performance.now() - startedAt),
    }));
  };
  let result: T;
  try {
    result = await contextStorage.run(context, () => fn(scope(id)));
  } catch (error) {
    await finish("failed", describe(error));
    throw error;
  }
  await finish("ok", null);
  return result;
}

/**
 * Stores one Usage Record under the current Pipeline Event. Awaited so no row is lost; a failure is logged, never thrown.
 * With a measurement, the row is stored as "measuring" and its measured cost is written in the background once final.
 * @param row - The record
 * @param measurement - A research call's balance measurement, if one was taken
 * @returns The record id, or null when tracking is off or the insert failed
 */
export async function recordUsage(row: UsageRecordRow, measurement?: MeasuredCall | null): Promise<string | null> {
  const current = installed;
  if (!current) return null;
  const pipelineEventId = contextStorage.getStore()?.pipelineEventId ?? null;
  const id = randomUUID();
  const facts = `vendor=${row.vendor} || modelId=${row.modelId} || pipelineEventId=${pipelineEventId}`;
  const measuring = measurement ? { measuredCostUsd: null, measurementNote: "Measuring: reading the vendor balance after the call" } : {};
  const stored = await safely("recordUsage", facts, async (sink) => {
    await sink.insertUsageRecord({ ...row, ...measuring, id, pipelineEventId });
    return true;
  });
  if (!stored) return null;
  if (measurement) {
    void measurement.result.then(async (result) => {
      // Write to the sink that stored the row; tracking turned off since means nothing to write to.
      if (installed !== current) return;
      await safely("recordUsage", `${facts} || id=${id}`, (sink) => sink.setUsageMeasurement(id, result));
    });
  }
  return id;
}

/**
 * Stores one Product Event. Never throws; callers need not await it.
 * @param kind - What the Learner did
 * @param options - Learner, Course Request, and small facts
 */
export async function recordProductEvent(
  kind: ProductEventKind,
  options: { learnerId: string | null; courseRequestId?: string | null; detail?: unknown },
): Promise<void> {
  await safely("recordProductEvent", `kind=${kind} || learnerId=${options.learnerId}`, (sink) => sink.insertProductEvent({
    kind, learnerId: options.learnerId, courseRequestId: options.courseRequestId ?? null, detail: options.detail ?? null,
  }));
}

/**
 * Stores one API Request. Never throws.
 * @param row - The request
 */
export async function recordApiRequest(row: ApiRequestRow): Promise<void> {
  await safely("recordApiRequest", `method=${row.method} || route=${row.route}`, (sink) => sink.insertApiRequest(row));
}

/**
 * Runs one model call with its port role and attempt number visible to the transport's observer.
 * @param frame - Role and 1-based attempt
 * @param fn - The transport call
 */
export function withModelCall<T>(frame: ModelCallFrame, fn: () => Promise<T>): Promise<T> {
  return modelCallStorage.run(frame, fn);
}

/**
 * The Usage Record for one OpenRouter call. Cost is `actual` whenever the body reported `usage.cost` (a refusal, a
 * cut-off reply, or one that failed our validation is still billed). With no reported cost: a call that never reached
 * OpenRouter (`configuration`) or that it refused at the HTTP layer (`http`) cost nothing; anything else (a timeout, a
 * network failure, an unreadable body) may have been billed, so its cost is `unknown`.
 * @param call - What the transport observed
 * @param frame - Port role and attempt; a call made outside the ports counts as a first `generator` attempt
 */
export function modelUsageRow(call: ModelCallObservation, frame: ModelCallFrame | undefined): UsageRecordRow {
  const reported = call.usage?.costUsd ?? null;
  const free = call.outcome === "configuration" || call.outcome === "http";
  const cost: { costUsd: number | null; costBasis: CostBasis } = reported !== null ? { costUsd: reported, costBasis: "actual" }
    : free ? { costUsd: 0, costBasis: "actual" } : { costUsd: null, costBasis: "unknown" };
  return {
    vendor: "openrouter",
    role: frame?.role ?? "generator",
    modelId: call.modelId,
    provider: call.provider,
    responseId: call.responseId,
    attempt: frame?.attempt ?? 1,
    outcome: call.outcome,
    invalidCause: call.invalidCause,
    httpStatus: call.httpStatus,
    error: call.error,
    promptTokens: call.usage?.promptTokens ?? null,
    completionTokens: call.usage?.completionTokens ?? null,
    reasoningTokens: call.usage?.reasoningTokens ?? null,
    cachedTokens: call.usage?.cachedTokens ?? null,
    ...cost,
    request: call.request,
    response: call.response ?? null,
    durationMs: call.durationMs,
  };
}

/**
 * The transport observer: stores the call as a Usage Record with the current port frame and Pipeline Event.
 * @param call - What the transport observed
 */
export async function recordModelCall(call: ModelCallObservation): Promise<void> {
  if (!installed) return;
  await recordUsage(modelUsageRow(call, modelCallStorage.getStore()));
}

/**
 * The OpenRouter transport the model ports use by default: every call it makes becomes a Usage Record.
 * @param options - Transport options other than the observer
 */
export function createTrackedTransport(options: Omit<OpenRouterOptions, "observe"> = {}): StructuredTransport {
  return createOpenRouterTransport({ ...options, observe: recordModelCall });
}

/** The research vendor each adapter calls. */
const RESEARCH_VENDORS: Record<ResearchAdapterId, UsageVendor> = RESEARCH_ADAPTER_VENDORS;

/** How a research call ended, as a Usage Record outcome. */
const RESEARCH_OUTCOMES: Record<SourcePackStatus, UsageOutcome> = {
  ok: "ok", empty_vendor: "empty_vendor", empty_filtered: "empty_filtered", timed_out: "timeout", error: "error",
};

/** One research vendor call, however it was made: by `runResearch` or by the diagnostic fact-check. */
export type VendorCallUsage = {
  adapter: Pick<ResearchAdapter, "id" | "timeoutMs" | "estimatedCostUsd">;
  role: Extract<UsageRole, "research_primary" | "research_secondary">;
  topic: string;
  status: SourcePackStatus;
  responseId: string | null;
  error: string | null;
  /** What the vendor returned (summary and Sources); null when nothing arrived. */
  response: unknown;
  durationMs: number;
};

/**
 * The Usage Record for one research vendor call. Neither vendor reports cost, so it is always `estimated` at the
 * adapter's list price: a call that answered (even with nothing usable) or that we timed out on is billed in full,
 * since the vendor still ran it; a call that failed is estimated at 0.
 * @param call - The vendor call
 */
export function vendorUsageRow(call: VendorCallUsage): UsageRecordRow {
  const request: ResearchUsageRequest = { topic: call.topic, adapter: call.adapter.id, timeoutMs: call.adapter.timeoutMs };
  return {
    vendor: RESEARCH_VENDORS[call.adapter.id],
    role: call.role,
    modelId: call.adapter.id,
    provider: null,
    responseId: call.responseId,
    attempt: 1,
    outcome: RESEARCH_OUTCOMES[call.status],
    invalidCause: null,
    httpStatus: null,
    error: call.error,
    promptTokens: null,
    completionTokens: null,
    reasoningTokens: null,
    cachedTokens: null,
    costUsd: call.status === "error" ? 0 : call.adapter.estimatedCostUsd,
    costBasis: "estimated",
    request,
    response: call.response ?? null,
    durationMs: call.durationMs,
  };
}

/**
 * The Usage Record for one `runResearch` vendor call; the response keeps the built pack and the vendor's raw answer.
 * @param call - What `runResearch` observed
 */
export function researchUsageRow(call: ResearchCallObservation): UsageRecordRow {
  const { pack } = call;
  return vendorUsageRow({
    adapter: call.adapter,
    role: call.slot === "primary" ? "research_primary" : "research_secondary",
    topic: call.topic,
    status: pack.status,
    responseId: pack.vendorRequestId,
    error: pack.error,
    response: { pack, vendorResult: call.vendorResult },
    durationMs: pack.latencyMs,
  });
}

/**
 * Starts measuring one research vendor call against the vendor balance. Call right before the vendor call and `end()`
 * the moment it returns; never throws and never delays the call.
 * @param adapterId - The research adapter about to be called
 * @returns The measurement, or null when tracking or the meter is off
 */
export function beginResearchMeasurement(adapterId: ResearchAdapterId): MeasuredCall | null {
  const meter = installed?.meter;
  if (!meter) return null;
  try {
    return meter.begin(RESEARCH_VENDORS[adapterId] as MeasuredVendor);
  } catch {
    return null;
  }
}

/**
 * Stores one research vendor call made outside `runResearch` under the current Pipeline Event.
 * @param call - The vendor call
 * @param measurement - Its balance measurement, from `beginResearchMeasurement`
 */
export async function recordVendorCall(call: VendorCallUsage, measurement?: MeasuredCall | null): Promise<void> {
  if (!installed) return;
  await recordUsage(vendorUsageRow(call), measurement);
}

/**
 * Tracking for one `runResearch` run: measures each vendor call from its start to its end, and stores each as a Usage
 * Record with its measurement attached. Spread into the `runResearch` options.
 * @returns The `onVendorCall` and `observe` hooks for that run
 */
export function trackResearchRun(): Required<Pick<ResearchOptions, "onVendorCall" | "observe">> {
  const bySlot = new Map<string, MeasuredCall>();
  return {
    onVendorCall({ slot, adapter }) {
      const measurement = beginResearchMeasurement(adapter.id as ResearchAdapterId);
      if (!measurement) return;
      bySlot.set(slot, measurement);
      return () => measurement.end();
    },
    async observe(call) {
      if (!installed) return;
      await recordUsage(researchUsageRow(call), bySlot.get(call.slot));
    },
  };
}

/**
 * The research observer: stores the vendor call as a Usage Record under the current Pipeline Event.
 * @param call - What `runResearch` observed
 */
export async function recordResearchCall(call: ResearchCallObservation): Promise<void> {
  if (!installed) return;
  await recordUsage(researchUsageRow(call));
}
