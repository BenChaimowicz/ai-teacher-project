import type {
  CostBasis,
  CostSplit,
  OpsApiRequestRow,
  OpsApiRouteRow,
  OpsBreakdownRow,
  OpsCourseRequestRow,
  OpsFailureGroup,
  OpsPipelineEventRow,
  OpsProductEventRow,
  OpsUsageRecordRow,
  PipelineEventKind,
  PipelineEventStatus,
  ProductEventKind,
  UsageOutcome,
  UsageRole,
  UsageVendor,
} from "@senoy/db";

/**
 * Pure helpers that turn raw SQL rows into the `/api/ops/*` contract. Postgres hands back counts and sums as strings
 * (bigint/numeric) and, through Drizzle's postgres-js driver, timestamps as Postgres text; these fix both.
 */

/** One row as the driver returns it, keyed by the SQL column alias. */
export type SqlRow = Record<string, unknown>;

/** Upper bounds (ms) of the Overview latency histogram; a final open-ended bucket follows. */
export const LATENCY_BOUNDS_MS = [1_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000] as const;

/** Longest Pipeline Event failure reason kept; longer first lines are cut with an ellipsis. */
export const MAX_REASON_LENGTH = 120;

/** How many example ids a failure group carries. */
export const FAILURE_SAMPLE_SIZE = 5;

const POSTGRES_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * Reads a number Postgres may have sent as a string. Null and garbage become 0.
 * @param value - A count, sum, or number
 * @returns A finite number
 */
export function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Like `toNumber`, but keeps "no value" as null.
 * @param value - A nullable number or numeric string
 * @returns The number, or null
 */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rounds a duration (percentiles and averages come back fractional) to whole milliseconds.
 * @param value - Milliseconds, maybe as a string, maybe null
 * @returns Whole milliseconds, or null
 */
export function toMs(value: unknown): number | null {
  const parsed = toNumberOrNull(value);
  return parsed === null ? null : Math.round(parsed);
}

/**
 * Turns a timestamp into an ISO string. Accepts a `Date` or Postgres text such as `2026-10-24 10:15:30.123456+00`
 * (microseconds are cut to milliseconds; a missing offset means UTC).
 * @param value - The timestamp
 * @returns The ISO instant
 * @throws Error when the value is not a recognisable timestamp
 */
export function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const match = POSTGRES_TIMESTAMP.exec(value.trim());
    if (match) {
      const [, date, time, fraction = "", zone = "Z"] = match;
      const millis = fraction ? fraction.slice(0, 4).padEnd(4, "0") : "";
      const offset = zone === "Z" ? "Z" : zone.length === 3 ? `${zone}:00` : zone.includes(":") ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
      const ms = Date.parse(`${date}T${time}${millis}${offset}`);
      if (!Number.isNaN(ms)) return new Date(ms).toISOString();
    }
    const fallback = Date.parse(value);
    if (!Number.isNaN(fallback)) return new Date(fallback).toISOString();
  }
  throw new Error(`[format.ts: toIso] Unrecognised timestamp || value=${String(value)}`);
}

/**
 * Like `toIso`, but keeps null.
 * @param value - The timestamp, or null
 * @returns The ISO instant, or null
 */
export function toIsoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value);
}

/**
 * Reads a nullable text column.
 * @param value - The column value
 * @returns The string, or null
 */
export function toText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/**
 * Builds the cost split from `actualUsd`, `estimatedUsd`, and `unknownCount` columns.
 * @param row - A row carrying those three aliases
 * @returns Actual, estimated, their total, and the count of billed-but-unpriced calls
 */
export function toCostSplit(row: SqlRow): CostSplit {
  const actualUsd = toNumber(row.actualUsd);
  const estimatedUsd = toNumber(row.estimatedUsd);
  return { actualUsd, estimatedUsd, totalUsd: actualUsd + estimatedUsd, unknownCount: toNumber(row.unknownCount) };
}

/**
 * Maps one Usage Record list row (never carries payloads).
 * @param row - Row from the usage-record select
 * @returns The contract row
 */
export function toUsageRecordRow(row: SqlRow): OpsUsageRecordRow {
  return {
    id: String(row.id),
    createdAt: toIso(row.createdAt),
    durationMs: toNumberOrNull(row.durationMs),
    vendor: row.vendor as UsageVendor,
    role: row.role as UsageRole,
    modelId: String(row.modelId),
    provider: toText(row.provider),
    responseId: toText(row.responseId),
    attempt: toNumber(row.attempt),
    outcome: row.outcome as UsageOutcome,
    invalidCause: toText(row.invalidCause),
    httpStatus: toNumberOrNull(row.httpStatus),
    error: toText(row.error),
    promptTokens: toNumberOrNull(row.promptTokens),
    completionTokens: toNumberOrNull(row.completionTokens),
    reasoningTokens: toNumberOrNull(row.reasoningTokens),
    cachedTokens: toNumberOrNull(row.cachedTokens),
    costUsd: toNumberOrNull(row.costUsd),
    costBasis: row.costBasis as CostBasis,
    pipelineEventId: toText(row.pipelineEventId),
    pipelineKind: (toText(row.pipelineKind) as PipelineEventKind | null) ?? null,
    pipelineLabel: toText(row.pipelineLabel),
    courseRequestId: toText(row.courseRequestId),
    courseRequestSubject: toText(row.courseRequestSubject),
  };
}

/**
 * Maps one Pipeline Event row with its rolled-up cost.
 * @param row - Row from the pipeline-event select
 * @returns The contract row
 */
export function toPipelineEventRow(row: SqlRow): OpsPipelineEventRow {
  return {
    ...toCostSplit(row),
    id: String(row.id),
    parentId: toText(row.parentId),
    kind: row.kind as PipelineEventKind,
    label: toText(row.label),
    status: row.status as PipelineEventStatus,
    error: toText(row.error),
    startedAt: toIso(row.startedAt),
    finishedAt: toIsoOrNull(row.finishedAt),
    durationMs: toNumberOrNull(row.durationMs),
    courseRequestId: toText(row.courseRequestId),
    courseRequestSubject: toText(row.courseRequestSubject),
    calls: toNumber(row.calls),
    failedCalls: toNumber(row.failedCalls),
  };
}

/**
 * Maps one Course Request row with its all-time cost.
 * @param row - Row from the course-request select
 * @returns The contract row
 */
export function toCourseRequestRow(row: SqlRow): OpsCourseRequestRow {
  return {
    ...toCostSplit(row),
    id: String(row.id),
    subject: String(row.subject),
    learningGoal: String(row.learningGoal),
    status: String(row.status),
    createdAt: toIso(row.createdAt),
    calls: toNumber(row.calls),
    failedCalls: toNumber(row.failedCalls),
    wallMs: toMs(row.wallMs),
  };
}

/**
 * Maps one spend slice (by model, Pipeline Event kind, or role).
 * @param row - Row from a breakdown select
 * @returns The contract row
 */
export function toBreakdownRow(row: SqlRow): OpsBreakdownRow {
  return {
    ...toCostSplit(row),
    key: String(row.key),
    calls: toNumber(row.calls),
    failedCalls: toNumber(row.failedCalls),
    avgDurationMs: toMs(row.avgDurationMs),
    p95DurationMs: toMs(row.p95DurationMs),
    promptTokens: toNumber(row.promptTokens),
    completionTokens: toNumber(row.completionTokens),
  };
}

/**
 * Maps one Product Event.
 * @param row - Row from the product-event select
 * @returns The contract row
 */
export function toProductEventRow(row: SqlRow): OpsProductEventRow {
  return {
    id: String(row.id),
    createdAt: toIso(row.createdAt),
    kind: row.kind as ProductEventKind,
    learnerId: toText(row.learnerId),
    courseRequestId: toText(row.courseRequestId),
    detail: row.detail ?? null,
  };
}

/**
 * Maps one API Request.
 * @param row - Row from the api-request select
 * @returns The contract row
 */
export function toApiRequestRow(row: SqlRow): OpsApiRequestRow {
  return {
    id: String(row.id),
    createdAt: toIso(row.createdAt),
    method: String(row.method),
    route: String(row.route),
    url: String(row.url),
    statusCode: toNumber(row.statusCode),
    durationMs: toNumber(row.durationMs),
    error: toText(row.error),
  };
}

/**
 * Maps one per-route traffic row.
 * @param row - Row from the api-routes select
 * @returns The contract row
 */
export function toApiRouteRow(row: SqlRow): OpsApiRouteRow {
  return {
    method: String(row.method),
    route: String(row.route),
    count: toNumber(row.count),
    errors: toNumber(row.errors),
    p50Ms: toMs(row.p50Ms),
    p95Ms: toMs(row.p95Ms),
    maxMs: toMs(row.maxMs),
  };
}

/**
 * Turns per-bucket counts (keyed by 0-based bucket index) into the full histogram, zero-filling empty buckets.
 * Index `i < LATENCY_BOUNDS_MS.length` means "≤ LATENCY_BOUNDS_MS[i]"; the last index is the open-ended bucket.
 * @param rows - `{ bucket, calls }` rows from SQL
 * @param bounds - Upper bounds in ms
 * @returns One entry per bucket, the last with `upToMs: null`
 */
export function toLatencyHistogram(
  rows: SqlRow[],
  bounds: readonly number[] = LATENCY_BOUNDS_MS,
): { upToMs: number | null; calls: number }[] {
  const counts = new Map(rows.map((row) => [toNumber(row.bucket), toNumber(row.calls)]));
  return [...bounds, null].map((upToMs, index) => ({ upToMs, calls: counts.get(index) ?? 0 }));
}

/**
 * Names why a Usage Record failed: `http 429` for an `http` outcome with a status (a status on other outcomes, such
 * as 200 on `invalid_output`, is not the reason), `invalid_output/schema` when a cause is stated, else the outcome.
 * @param record - The outcome, invalid cause, and HTTP status
 * @returns The failure reason
 */
export function usageFailureReason(record: {
  outcome: string;
  invalidCause: string | null;
  httpStatus: number | null;
}): string {
  if (record.outcome === "http" && record.httpStatus !== null) return `http ${record.httpStatus}`;
  if (record.invalidCause) return `${record.outcome}/${record.invalidCause}`;
  return record.outcome;
}

/**
 * Names why a Pipeline Event failed: the first non-empty line of its error, cut to `MAX_REASON_LENGTH`.
 * @param error - The stored error text, or null
 * @returns The failure reason (`failed` when there is no text)
 */
export function pipelineFailureReason(error: string | null): string {
  const firstLine = (error ?? "").split(/\r?\n/).map((line) => line.trim()).find((line) => line !== "") ?? "";
  if (firstLine === "") return "failed";
  return firstLine.length > MAX_REASON_LENGTH ? `${firstLine.slice(0, MAX_REASON_LENGTH - 1)}…` : firstLine;
}

/**
 * Merges failure groups that share source, reason, and key (SQL groups by raw columns; formatting can collapse
 * several into one reason), keeping the newest sample ids, then sorts by count, then recency.
 * @param groups - Groups before merging, each with its own sample ids newest first
 * @returns Merged, sorted groups
 */
export function mergeFailureGroups(groups: OpsFailureGroup[]): OpsFailureGroup[] {
  const merged = new Map<string, OpsFailureGroup & { samples: { id: string; at: string }[] }>();
  for (const group of groups) {
    const id = JSON.stringify([group.source, group.reason, group.key]);
    const samples = group.sampleIds.map((sampleId) => ({ id: sampleId, at: group.lastAt }));
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, { ...group, samples });
      continue;
    }
    existing.count += group.count;
    existing.wastedUsd += group.wastedUsd;
    if (group.lastAt > existing.lastAt) existing.lastAt = group.lastAt;
    existing.samples.push(...samples);
  }
  return [...merged.values()]
    .map(({ samples, ...group }) => ({
      ...group,
      sampleIds: samples
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .slice(0, FAILURE_SAMPLE_SIZE)
        .map((sample) => sample.id),
    }))
    .sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
}

/**
 * Escapes `%`, `_`, and `\` so a search term matches literally inside `ILIKE '%…%'`.
 * @param term - What the Operator typed
 * @returns The escaped term
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
