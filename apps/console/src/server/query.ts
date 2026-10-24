import {
  PIPELINE_EVENT_KINDS,
  PIPELINE_EVENT_STATUSES,
  PRODUCT_EVENT_KINDS,
  USAGE_OUTCOMES,
  USAGE_ROLES,
  USAGE_VENDORS,
  type PipelineEventKind,
  type PipelineEventStatus,
  type ProductEventKind,
  type UsageOutcome,
  type UsageRole,
  type UsageVendor,
} from "@senoy/db";

/**
 * Turns raw `/api/ops/*` query strings into checked, typed filters. Every parser throws `QueryError` on bad input so
 * the route answers 400; nothing here touches the database.
 */

/** Days in the default range when the caller sends no `from`. */
export const DEFAULT_RANGE_DAYS = 7;
/** Ranges this long or shorter are charted per hour; longer ones per day. */
export const HOURLY_BUCKET_MAX_MS = 48 * 60 * 60 * 1000;
/** Rows per page when the caller sends no `limit`. */
export const DEFAULT_LIMIT = 50;
/** Largest page a caller may ask for; larger asks are clamped to it. */
export const MAX_LIMIT = 500;

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A date, optionally with a time and offset: `2026-10-24`, `2026-10-24T10:00:00Z`, `2026-10-24T10:00:00.123+03:00`. */
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** A query or path parameter the caller got wrong; its message is safe to send back. */
export class QueryError extends Error {
  /**
   * @param message - What was wrong, phrased for the caller
   */
  constructor(message: string) {
    super(message);
    this.name = "QueryError";
  }
}

/** Fastify's parsed querystring: each key is a string, or an array when repeated. */
export type RawQuery = Record<string, unknown>;

/** Chart granularity of the Overview timeseries. */
export type Bucket = "hour" | "day";

/** A checked time range: `from` inclusive, `to` exclusive, both ISO instants. */
export type ResolvedRange = { from: string; to: string };

/** Page window of a list route. */
export type PageWindow = { limit: number; offset: number };

/** Checked `GET /usage-records` filters. */
export type UsageRecordFilter = ResolvedRange &
  PageWindow & {
    vendor?: UsageVendor;
    role?: UsageRole;
    modelId?: string;
    outcome?: UsageOutcome | "failed";
    pipelineKind?: PipelineEventKind;
    pipelineEventId?: string;
    courseRequestId?: string;
    q?: string;
    sort: "createdAt" | "costUsd" | "durationMs";
  };

/** Checked `GET /pipeline-events` filters. */
export type PipelineEventFilter = ResolvedRange &
  PageWindow & { kind?: PipelineEventKind; status?: PipelineEventStatus; courseRequestId?: string };

/** Checked `GET /course-requests` filters. */
export type CourseRequestFilter = ResolvedRange & PageWindow;

/** Checked `GET /product-events` filters. */
export type ProductEventFilter = ResolvedRange & PageWindow & { kind?: ProductEventKind };

/** Checked `GET /api-requests` filters. */
export type ApiRequestFilter = ResolvedRange & PageWindow & { route?: string; errorsOnly: boolean };

/**
 * Reads one query value as a single trimmed string; empty counts as absent.
 * @param raw - The parsed querystring
 * @param name - Parameter name
 * @returns The value, or undefined when absent
 * @throws QueryError when the parameter is repeated
 */
export function readString(raw: RawQuery, name: string): string | undefined {
  const value = raw[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new QueryError(`${name} must be given once`);
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Reads a value that must be one of a fixed set.
 * @param raw - The parsed querystring
 * @param name - Parameter name
 * @param allowed - The accepted values
 * @returns The value, or undefined when absent
 * @throws QueryError when the value is not in the set
 */
export function readEnum<T extends string>(raw: RawQuery, name: string, allowed: readonly T[]): T | undefined {
  const value = readString(raw, name);
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new QueryError(`${name} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

/**
 * Checks that a string is a UUID.
 * @param value - The candidate
 * @param name - Parameter name, for the error
 * @returns The value, lower-cased
 * @throws QueryError when the value is not a UUID
 */
export function assertUuid(value: string, name: string): string {
  if (!UUID_PATTERN.test(value)) throw new QueryError(`${name} must be a UUID`);
  return value.toLowerCase();
}

/**
 * Reads an optional UUID parameter.
 * @param raw - The parsed querystring
 * @param name - Parameter name
 * @returns The UUID, or undefined when absent
 * @throws QueryError when the value is not a UUID
 */
export function readUuid(raw: RawQuery, name: string): string | undefined {
  const value = readString(raw, name);
  return value === undefined ? undefined : assertUuid(value, name);
}

/**
 * Reads an optional ISO instant (a bare date means midnight UTC).
 * @param raw - The parsed querystring
 * @param name - Parameter name
 * @returns The instant in milliseconds, or undefined when absent
 * @throws QueryError when the value is not an ISO date or instant
 */
export function readInstant(raw: RawQuery, name: string): number | undefined {
  const value = readString(raw, name);
  if (value === undefined) return undefined;
  const ms = INSTANT_PATTERN.test(value) ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(ms)) throw new QueryError(`${name} must be an ISO date or instant`);
  return ms;
}

/**
 * Reads an optional non-negative integer.
 * @param raw - The parsed querystring
 * @param name - Parameter name
 * @returns The integer, or undefined when absent
 * @throws QueryError when the value is not a whole number ≥ 0
 */
export function readCount(raw: RawQuery, name: string): number | undefined {
  const value = readString(raw, name);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new QueryError(`${name} must be a whole number`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new QueryError(`${name} is too large`);
  return parsed;
}

/**
 * Reads an optional boolean flag (`true`/`false`/`1`/`0`).
 * @param raw - The parsed querystring
 * @param name - Parameter name
 * @returns The flag; false when absent
 * @throws QueryError on any other value
 */
export function readFlag(raw: RawQuery, name: string): boolean {
  const value = readString(raw, name);
  if (value === undefined) return false;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new QueryError(`${name} must be true or false`);
}

/**
 * Resolves `from`/`to`. Missing `to` is now; missing `from` is seven days before `to`.
 * @param raw - The parsed querystring
 * @param now - The current instant (injected for tests)
 * @returns The range as ISO instants
 * @throws QueryError when either end is malformed or `from` is not before `to`
 */
export function parseRange(raw: RawQuery, now: Date = new Date()): ResolvedRange {
  const toMs = readInstant(raw, "to") ?? now.getTime();
  const fromMs = readInstant(raw, "from") ?? toMs - DEFAULT_RANGE_DAYS * DAY_MS;
  if (fromMs >= toMs) throw new QueryError("from must be before to");
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
}

/**
 * The range of the same length that ends where this one starts, for "vs previous" deltas.
 * @param range - The current range
 * @returns The previous range
 */
export function previousRange(range: ResolvedRange): ResolvedRange {
  const fromMs = Date.parse(range.from);
  const lengthMs = Date.parse(range.to) - fromMs;
  return { from: new Date(fromMs - lengthMs).toISOString(), to: range.from };
}

/**
 * Picks the timeseries bucket: hourly up to 48 hours, daily beyond.
 * @param range - The range being charted
 * @returns `hour` or `day`
 */
export function chooseBucket(range: ResolvedRange): Bucket {
  return Date.parse(range.to) - Date.parse(range.from) <= HOURLY_BUCKET_MAX_MS ? "hour" : "day";
}

/**
 * Reads `limit` (default 50, clamped to 500, at least 1) and `offset` (default 0).
 * @param raw - The parsed querystring
 * @returns The page window
 * @throws QueryError when either is not a whole number, or `limit` is 0
 */
export function parsePage(raw: RawQuery): PageWindow {
  const limit = readCount(raw, "limit") ?? DEFAULT_LIMIT;
  if (limit < 1) throw new QueryError("limit must be at least 1");
  return { limit: Math.min(limit, MAX_LIMIT), offset: readCount(raw, "offset") ?? 0 };
}

/**
 * Checks `GET /usage-records` query.
 * @param raw - The parsed querystring
 * @param now - The current instant
 * @returns Typed filters
 * @throws QueryError on any bad parameter
 */
export function parseUsageRecordQuery(raw: RawQuery, now?: Date): UsageRecordFilter {
  return {
    ...parseRange(raw, now),
    ...parsePage(raw),
    vendor: readEnum(raw, "vendor", USAGE_VENDORS),
    role: readEnum(raw, "role", USAGE_ROLES),
    modelId: readString(raw, "modelId"),
    outcome: readEnum(raw, "outcome", [...USAGE_OUTCOMES, "failed"] as const),
    pipelineKind: readEnum(raw, "pipelineKind", PIPELINE_EVENT_KINDS),
    pipelineEventId: readUuid(raw, "pipelineEventId"),
    courseRequestId: readUuid(raw, "courseRequestId"),
    q: readString(raw, "q"),
    sort: readEnum(raw, "sort", ["createdAt", "costUsd", "durationMs"] as const) ?? "createdAt",
  };
}

/**
 * Checks `GET /pipeline-events` query.
 * @param raw - The parsed querystring
 * @param now - The current instant
 * @returns Typed filters
 * @throws QueryError on any bad parameter
 */
export function parsePipelineEventQuery(raw: RawQuery, now?: Date): PipelineEventFilter {
  return {
    ...parseRange(raw, now),
    ...parsePage(raw),
    kind: readEnum(raw, "kind", PIPELINE_EVENT_KINDS),
    status: readEnum(raw, "status", PIPELINE_EVENT_STATUSES),
    courseRequestId: readUuid(raw, "courseRequestId"),
  };
}

/**
 * Checks `GET /course-requests` query.
 * @param raw - The parsed querystring
 * @param now - The current instant
 * @returns Typed filters
 * @throws QueryError on any bad parameter
 */
export function parseCourseRequestQuery(raw: RawQuery, now?: Date): CourseRequestFilter {
  return { ...parseRange(raw, now), ...parsePage(raw) };
}

/**
 * Checks `GET /product-events` query.
 * @param raw - The parsed querystring
 * @param now - The current instant
 * @returns Typed filters
 * @throws QueryError on any bad parameter
 */
export function parseProductEventQuery(raw: RawQuery, now?: Date): ProductEventFilter {
  return { ...parseRange(raw, now), ...parsePage(raw), kind: readEnum(raw, "kind", PRODUCT_EVENT_KINDS) };
}

/**
 * Checks `GET /api-requests` query.
 * @param raw - The parsed querystring
 * @param now - The current instant
 * @returns Typed filters
 * @throws QueryError on any bad parameter
 */
export function parseApiRequestQuery(raw: RawQuery, now?: Date): ApiRequestFilter {
  return {
    ...parseRange(raw, now),
    ...parsePage(raw),
    route: readString(raw, "route"),
    errorsOnly: readFlag(raw, "errorsOnly"),
  };
}
