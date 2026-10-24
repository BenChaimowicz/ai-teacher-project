import { sql, type SQL } from "drizzle-orm";
import type {
  Database,
  OpsApiRequestRow,
  OpsApiRouteRow,
  OpsCourseRequestDetail,
  OpsCourseRequestRow,
  OpsFailureGroup,
  OpsPage,
  OpsPipelineEventDetail,
  OpsPipelineEventRow,
  OpsProductEventRow,
  OpsSummary,
  OpsUsageRecordDetail,
  OpsUsageRecordRow,
  UsageOutcome,
} from "@senoy/db";
import {
  FAILURE_SAMPLE_SIZE,
  LATENCY_BOUNDS_MS,
  escapeLike,
  mergeFailureGroups,
  pipelineFailureReason,
  toApiRequestRow,
  toApiRouteRow,
  toBreakdownRow,
  toCostSplit,
  toCourseRequestRow,
  toIso,
  toLatencyHistogram,
  toMs,
  toNumber,
  toPipelineEventRow,
  toProductEventRow,
  toText,
  toUsageRecordRow,
  usageFailureReason,
  type SqlRow,
} from "./format.ts";
import {
  chooseBucket,
  previousRange,
  type ApiRequestFilter,
  type CourseRequestFilter,
  type PipelineEventFilter,
  type ProductEventFilter,
  type ResolvedRange,
  type UsageRecordFilter,
} from "./query.ts";

/**
 * The Usage Console's only door to Postgres. Every `/api/ops/*` route asks this store; tests swap in a fake.
 * All SQL is raw (Drizzle's `sql` template, values always bound as parameters) because nearly every query aggregates.
 * List queries never select the Usage Record `request`/`response` payloads; only `getUsageRecord` does.
 */

/** Runs one SQL statement and returns its rows. */
export type SqlRunner = (query: SQL) => Promise<SqlRow[]>;

/** Everything the `/api/ops/*` routes read. `get*` return null when the id does not exist. */
export type OpsStore = {
  summary(range: ResolvedRange): Promise<OpsSummary>;
  listUsageRecords(filter: UsageRecordFilter): Promise<OpsPage<OpsUsageRecordRow>>;
  getUsageRecord(id: string): Promise<OpsUsageRecordDetail | null>;
  listPipelineEvents(filter: PipelineEventFilter): Promise<OpsPage<OpsPipelineEventRow>>;
  getPipelineEvent(id: string): Promise<OpsPipelineEventDetail | null>;
  listCourseRequests(filter: CourseRequestFilter): Promise<OpsPage<OpsCourseRequestRow>>;
  getCourseRequest(id: string): Promise<OpsCourseRequestDetail | null>;
  listFailures(range: ResolvedRange): Promise<OpsFailureGroup[]>;
  listProductEvents(filter: ProductEventFilter): Promise<OpsPage<OpsProductEventRow>>;
  listApiRequests(filter: ApiRequestFilter): Promise<OpsPage<OpsApiRequestRow>>;
  listApiRoutes(range: ResolvedRange): Promise<OpsApiRouteRow[]>;
};

/** Cost split, call count, and failed-call count over Usage Records aliased `u` (null-safe under a left join). */
const SPEND_COLUMNS = sql`
  coalesce(sum(u.cost_usd) filter (where u.cost_basis = 'actual'), 0) as "actualUsd",
  coalesce(sum(u.cost_usd) filter (where u.cost_basis = 'estimated'), 0) as "estimatedUsd",
  count(u.id) filter (where u.cost_basis = 'unknown') as "unknownCount",
  count(u.id) as "calls",
  count(u.id) filter (where u.outcome <> 'ok') as "failedCalls"`;

/** Priced spend of Usage Records aliased `u`, for ordering. */
const PRICED_SPEND = sql`coalesce(sum(u.cost_usd) filter (where u.cost_basis in ('actual', 'estimated')), 0)`;

/** A Usage Record list row, payloads excluded. Needs `u`, `pe`, and `cr` from `USAGE_RECORD_FROM`. */
const USAGE_RECORD_COLUMNS = sql`
  u.id, u.created_at as "createdAt", u.duration_ms as "durationMs", u.vendor, u.role, u.model_id as "modelId",
  u.provider, u.response_id as "responseId", u.attempt, u.outcome, u.invalid_cause as "invalidCause",
  u.http_status as "httpStatus", u.error, u.prompt_tokens as "promptTokens", u.completion_tokens as "completionTokens",
  u.reasoning_tokens as "reasoningTokens", u.cached_tokens as "cachedTokens", u.cost_usd as "costUsd",
  u.cost_basis as "costBasis", u.pipeline_event_id as "pipelineEventId", pe.kind as "pipelineKind",
  pe.label as "pipelineLabel", pe.course_request_id as "courseRequestId", cr.subject as "courseRequestSubject"`;

/** Usage Records with their Pipeline Event and that event's Course Request. */
const USAGE_RECORD_FROM = sql`
  from usage_records u
  left join pipeline_events pe on pe.id = u.pipeline_event_id
  left join course_requests cr on cr.id = pe.course_request_id`;

/**
 * Joins conditions with `and`; no conditions means everything.
 * @param conditions - SQL predicates
 * @returns One predicate
 */
function allOf(conditions: SQL[]): SQL {
  return conditions.length === 0 ? sql`true` : sql.join(conditions, sql` and `);
}

/**
 * `column` falls in `[from, to)`.
 * @param column - Raw column reference such as `u.created_at`
 * @param range - The range
 * @returns The predicate
 */
function inRange(column: string, range: ResolvedRange): SQL {
  return sql`${sql.raw(column)} >= ${range.from}::timestamptz and ${sql.raw(column)} < ${range.to}::timestamptz`;
}

/**
 * Course Requests "active" in a range: created in it, or with a Pipeline Event that started in it (so a request made
 * last month that regenerated today still shows). Needs `cr`.
 * @param range - The range
 * @returns The predicate
 */
function courseRequestActiveIn(range: ResolvedRange): SQL {
  return sql`(${inRange("cr.created_at", range)} or exists (
    select 1 from pipeline_events active_event
    where active_event.course_request_id = cr.id and ${inRange("active_event.started_at", range)}))`;
}

/**
 * Builds the `where` of a Usage Record list from its filters.
 * @param filter - Checked filters
 * @returns The predicate over `u`, `pe`, `cr`
 */
export function usageRecordWhere(filter: UsageRecordFilter): SQL {
  const conditions: SQL[] = [inRange("u.created_at", filter)];
  if (filter.vendor) conditions.push(sql`u.vendor = ${filter.vendor}`);
  if (filter.role) conditions.push(sql`u.role = ${filter.role}`);
  if (filter.modelId) conditions.push(sql`u.model_id = ${filter.modelId}`);
  if (filter.outcome === "failed") conditions.push(sql`u.outcome <> 'ok'`);
  else if (filter.outcome) conditions.push(sql`u.outcome = ${filter.outcome}`);
  if (filter.pipelineKind) conditions.push(sql`pe.kind = ${filter.pipelineKind}`);
  if (filter.pipelineEventId) {
    // The event and everything nested under it, so filtering by a Course generation shows its Readings' calls.
    conditions.push(sql`u.pipeline_event_id in (
      with recursive subtree as (
        select ${filter.pipelineEventId}::uuid as id
        union all
        select child.id from pipeline_events child join subtree on child.parent_id = subtree.id
      )
      select id from subtree)`);
  }
  if (filter.courseRequestId) conditions.push(sql`pe.course_request_id = ${filter.courseRequestId}::uuid`);
  if (filter.q) {
    const pattern = `%${escapeLike(filter.q)}%`;
    conditions.push(sql`(u.model_id ilike ${pattern} or u.response_id ilike ${pattern} or u.error ilike ${pattern})`);
  }
  return allOf(conditions);
}

/** `ORDER BY` per Usage Record sort; ties fall back to newest first. */
const USAGE_RECORD_ORDER: Record<UsageRecordFilter["sort"], SQL> = {
  createdAt: sql`u.created_at desc, u.id desc`,
  costUsd: sql`u.cost_usd desc nulls last, u.created_at desc, u.id desc`,
  durationMs: sql`u.duration_ms desc nulls last, u.created_at desc, u.id desc`,
};

/**
 * Selects one page of Usage Records (no payloads).
 * @param filter - Checked filters
 * @returns The query
 */
export function usageRecordListQuery(filter: UsageRecordFilter): SQL {
  return sql`select ${USAGE_RECORD_COLUMNS} ${USAGE_RECORD_FROM}
    where ${usageRecordWhere(filter)}
    order by ${USAGE_RECORD_ORDER[filter.sort]}
    limit ${filter.limit} offset ${filter.offset}`;
}

/**
 * Selects Pipeline Event rows, each with the spend of every Usage Record in its subtree (itself and all
 * descendants), in the order of `page.ord`.
 * @param page - A query yielding `id` (event ids to show) and `ord` (display order); may contain its own `with`
 * @returns The query
 */
export function pipelineEventRowsQuery(page: SQL): SQL {
  return sql`with recursive page as (${page}),
    tree as (
      select p.id as root_id, p.id as event_id from page p
      union all
      select tree.root_id, child.id from tree join pipeline_events child on child.parent_id = tree.event_id
    ),
    spend as (
      select tree.root_id, ${SPEND_COLUMNS}
      from tree join usage_records u on u.pipeline_event_id = tree.event_id
      group by tree.root_id
    )
    select pe.id, pe.parent_id as "parentId", pe.kind, pe.label, pe.status, pe.error, pe.started_at as "startedAt",
      pe.finished_at as "finishedAt", pe.duration_ms as "durationMs", pe.course_request_id as "courseRequestId",
      cr.subject as "courseRequestSubject", spend."actualUsd", spend."estimatedUsd", spend."unknownCount",
      spend.calls, spend."failedCalls"
    from page
    join pipeline_events pe on pe.id = page.id
    left join course_requests cr on cr.id = pe.course_request_id
    left join spend on spend.root_id = pe.id
    order by page.ord`;
}

/**
 * Builds the `where` of a Pipeline Event list.
 * @param filter - Checked filters
 * @returns The predicate over `pe`
 */
function pipelineEventWhere(filter: PipelineEventFilter): SQL {
  const conditions: SQL[] = [inRange("pe.started_at", filter)];
  if (filter.kind) conditions.push(sql`pe.kind = ${filter.kind}`);
  if (filter.status) conditions.push(sql`pe.status = ${filter.status}`);
  if (filter.courseRequestId) conditions.push(sql`pe.course_request_id = ${filter.courseRequestId}::uuid`);
  return allOf(conditions);
}

/**
 * Selects Course Request rows with all-time spend (through their Pipeline Events) and wall time.
 * @param where - Predicate over `cr`
 * @param orderBy - Ordering; may use `spend.*`
 * @param window - Optional limit and offset
 * @returns The query
 */
export function courseRequestRowsQuery(where: SQL, orderBy: SQL, window?: { limit: number; offset: number }): SQL {
  const paging = window ? sql`limit ${window.limit} offset ${window.offset}` : sql``;
  return sql`select cr.id, cr.subject, cr.learning_goal as "learningGoal", cr.status, cr.created_at as "createdAt",
      spend."actualUsd", spend."estimatedUsd", spend."unknownCount", spend.calls, spend."failedCalls",
      extract(epoch from (wall.last_finish - wall.first_start)) * 1000 as "wallMs"
    from course_requests cr
    left join lateral (
      select ${SPEND_COLUMNS}
      from pipeline_events pe join usage_records u on u.pipeline_event_id = pe.id
      where pe.course_request_id = cr.id
    ) spend on true
    left join lateral (
      select min(pe.started_at) as first_start, max(pe.finished_at) as last_finish
      from pipeline_events pe where pe.course_request_id = cr.id
    ) wall on true
    where ${where}
    order by ${orderBy}
    ${paging}`;
}

/**
 * `case` that maps `u.duration_ms` to its 0-based latency bucket (bounds are constants, inlined).
 * @returns The expression
 */
function latencyBucketExpression(): SQL {
  const whens = LATENCY_BOUNDS_MS.map((bound, index) => `when u.duration_ms <= ${bound} then ${index}`).join(" ");
  return sql.raw(`case ${whens} else ${LATENCY_BOUNDS_MS.length} end`);
}

/**
 * Selects one spend slice per key over Usage Records in range.
 * @param keyExpression - Static SQL for the key (`u.model_id`, `u.role`, ...)
 * @param range - The range
 * @returns The query
 */
function breakdownQuery(keyExpression: string, range: ResolvedRange): SQL {
  return sql`select ${sql.raw(keyExpression)} as key, ${SPEND_COLUMNS},
      avg(u.duration_ms) as "avgDurationMs",
      percentile_cont(0.95) within group (order by u.duration_ms::double precision) as "p95DurationMs",
      coalesce(sum(u.prompt_tokens), 0) as "promptTokens",
      coalesce(sum(u.completion_tokens), 0) as "completionTokens"
    from usage_records u left join pipeline_events pe on pe.id = u.pipeline_event_id
    where ${inRange("u.created_at", range)}
    group by 1
    order by ${PRICED_SPEND} desc, count(u.id) desc, 1`;
}

/**
 * Reads a JSON or Postgres array of ids into strings.
 * @param value - `["a","b"]`, a JSON string of it, or `{a,b}`
 * @returns The ids
 */
function toIdList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    if (value.startsWith("[")) return (JSON.parse(value) as unknown[]).map(String);
    if (value.startsWith("{")) return value.slice(1, -1).split(",").filter(Boolean);
  }
  return [];
}

/**
 * Counts rows of a list query.
 * @param run - The SQL runner
 * @param query - A `select count(*) as total ...` query
 * @returns The count
 */
async function countOf(run: SqlRunner, query: SQL): Promise<number> {
  const [row] = await run(query);
  return toNumber(row?.total);
}

/**
 * Builds the store over any SQL runner.
 * @param run - Executes SQL (the real database, or a fake in tests)
 * @returns The store
 */
export function createOpsStore(run: SqlRunner): OpsStore {
  /**
   * Usage Records matching a predicate, payloads excluded.
   * @param where - Predicate over `u`, `pe`, `cr`
   * @param orderBy - Ordering
   * @returns Mapped rows
   */
  async function usageRecordRows(where: SQL, orderBy: SQL): Promise<OpsUsageRecordRow[]> {
    const rows = await run(sql`select ${USAGE_RECORD_COLUMNS} ${USAGE_RECORD_FROM} where ${where} order by ${orderBy}`);
    return rows.map(toUsageRecordRow);
  }

  /**
   * Pipeline Event rows for a page query.
   * @param page - Yields `id` and `ord`
   * @returns Mapped rows
   */
  async function pipelineEventRows(page: SQL): Promise<OpsPipelineEventRow[]> {
    return (await run(pipelineEventRowsQuery(page))).map(toPipelineEventRow);
  }

  return {
    async summary(range) {
      const previous = previousRange(range);
      const bucket = chooseBucket(range);
      const usageInRange = inRange("u.created_at", range);
      const [totals, counts, before, series, byModel, byKind, byRole, byOutcome, latency, top] = await Promise.all([
        run(sql`select ${SPEND_COLUMNS},
            coalesce(sum(u.prompt_tokens), 0) as "promptTokens",
            coalesce(sum(u.completion_tokens), 0) as "completionTokens",
            coalesce(sum(u.reasoning_tokens), 0) as "reasoningTokens",
            percentile_cont(0.5) within group (order by u.duration_ms::double precision) as "p50DurationMs",
            percentile_cont(0.95) within group (order by u.duration_ms::double precision) as "p95DurationMs"
          from usage_records u where ${usageInRange}`),
        run(sql`select
            (select count(*) from course_requests cr where ${courseRequestActiveIn(range)}) as "courseRequests",
            (select count(*) from pipeline_events pe where ${inRange("pe.started_at", range)}) as "pipelineEvents",
            (select count(*) from pipeline_events pe
              where ${inRange("pe.started_at", range)} and pe.status = 'failed') as "failedPipelineEvents",
            (select count(*) from product_events p where ${inRange("p.created_at", range)}) as "productEvents",
            (select count(*) from api_requests a where ${inRange("a.created_at", range)}) as "apiRequests",
            (select count(*) from api_requests a
              where ${inRange("a.created_at", range)} and a.status_code >= 500) as "apiErrors"`),
        run(sql`select ${PRICED_SPEND} as "totalUsd", count(u.id) as calls,
            count(u.id) filter (where u.outcome <> 'ok') as "failedCalls"
          from usage_records u where ${inRange("u.created_at", previous)}`),
        run(sql`select date_trunc(${sql.raw(`'${bucket}'`)}, u.created_at, 'UTC') as bucket, u.model_id as key,
            coalesce(sum(u.cost_usd), 0) as "costUsd", count(u.id) as calls,
            count(u.id) filter (where u.outcome <> 'ok') as "failedCalls"
          from usage_records u where ${usageInRange}
          group by 1, 2 order by 1, 2`),
        run(breakdownQuery("u.model_id", range)),
        run(breakdownQuery("coalesce(pe.kind, 'unattributed')", range)),
        run(breakdownQuery("u.role", range)),
        run(sql`select u.outcome, count(u.id) as calls from usage_records u where ${usageInRange}
          group by 1 order by 2 desc, 1`),
        run(sql`select ${latencyBucketExpression()} as bucket, count(u.id) as calls
          from usage_records u where ${usageInRange} and u.duration_ms is not null group by 1`),
        run(courseRequestRowsQuery(
          courseRequestActiveIn(range),
          sql`coalesce(spend."actualUsd", 0) + coalesce(spend."estimatedUsd", 0) desc, cr.created_at desc`,
          { limit: 5, offset: 0 },
        )),
      ]);
      const total = totals[0] ?? {};
      const count = counts[0] ?? {};
      const prior = before[0] ?? {};
      return {
        range: { ...range, bucket },
        totals: {
          ...toCostSplit(total),
          calls: toNumber(total.calls),
          failedCalls: toNumber(total.failedCalls),
          promptTokens: toNumber(total.promptTokens),
          completionTokens: toNumber(total.completionTokens),
          reasoningTokens: toNumber(total.reasoningTokens),
          p50DurationMs: toMs(total.p50DurationMs),
          p95DurationMs: toMs(total.p95DurationMs),
          courseRequests: toNumber(count.courseRequests),
          pipelineEvents: toNumber(count.pipelineEvents),
          failedPipelineEvents: toNumber(count.failedPipelineEvents),
          productEvents: toNumber(count.productEvents),
          apiRequests: toNumber(count.apiRequests),
          apiErrors: toNumber(count.apiErrors),
        },
        previous: {
          totalUsd: toNumber(prior.totalUsd),
          calls: toNumber(prior.calls),
          failedCalls: toNumber(prior.failedCalls),
        },
        timeseries: series.map((row) => ({
          bucket: toIso(row.bucket),
          key: String(row.key),
          costUsd: toNumber(row.costUsd),
          calls: toNumber(row.calls),
          failedCalls: toNumber(row.failedCalls),
        })),
        byModel: byModel.map(toBreakdownRow),
        byPipelineKind: byKind.map(toBreakdownRow),
        byRole: byRole.map(toBreakdownRow),
        byOutcome: byOutcome.map((row) => ({ outcome: row.outcome as UsageOutcome, calls: toNumber(row.calls) })),
        latencyHistogram: toLatencyHistogram(latency),
        topCourseRequests: top.map(toCourseRequestRow),
      };
    },

    async listUsageRecords(filter) {
      const [rows, total] = await Promise.all([
        run(usageRecordListQuery(filter)),
        countOf(run, sql`select count(*) as total ${USAGE_RECORD_FROM} where ${usageRecordWhere(filter)}`),
      ]);
      return { rows: rows.map(toUsageRecordRow), total };
    },

    async getUsageRecord(id) {
      const [found] = await run(sql`select ${USAGE_RECORD_COLUMNS}, u.request, u.response ${USAGE_RECORD_FROM}
        where u.id = ${id}::uuid`);
      if (!found) return null;
      const record = toUsageRecordRow(found);
      const eventId = record.pipelineEventId;
      const [pipelinePath, siblings] = eventId
        ? await Promise.all([
            pipelineEventRows(sql`with recursive up as (
                select ancestor.id, ancestor.parent_id, 0 as depth from pipeline_events ancestor
                where ancestor.id = ${eventId}::uuid
                union all
                select ancestor.id, ancestor.parent_id, up.depth + 1
                from up join pipeline_events ancestor on ancestor.id = up.parent_id
                where up.depth < 64
              )
              select id, depth as ord from up`),
            usageRecordRows(
              sql`u.pipeline_event_id = ${eventId}::uuid and u.id <> ${id}::uuid`,
              sql`u.created_at, u.attempt, u.id`,
            ),
          ])
        : [[], []];
      return { ...record, request: found.request ?? null, response: found.response ?? null, pipelinePath, siblings };
    },

    async listPipelineEvents(filter) {
      const where = pipelineEventWhere(filter);
      const [rows, total] = await Promise.all([
        pipelineEventRows(sql`select pe.id, row_number() over (order by pe.started_at desc, pe.id desc) as ord
          from pipeline_events pe where ${where}
          order by pe.started_at desc, pe.id desc
          limit ${filter.limit} offset ${filter.offset}`),
        countOf(run, sql`select count(*) as total from pipeline_events pe where ${where}`),
      ]);
      return { rows, total };
    },

    async getPipelineEvent(id) {
      const [[row], [extra], children, usageRecords] = await Promise.all([
        pipelineEventRows(sql`select ${id}::uuid as id, 1 as ord`),
        run(sql`select pe.detail from pipeline_events pe where pe.id = ${id}::uuid`),
        pipelineEventRows(sql`select child.id, row_number() over (order by child.started_at, child.id) as ord
          from pipeline_events child where child.parent_id = ${id}::uuid`),
        usageRecordRows(sql`u.pipeline_event_id = ${id}::uuid`, sql`u.created_at, u.attempt, u.id`),
      ]);
      if (!row) return null;
      return { ...row, detail: extra?.detail ?? null, children, usageRecords };
    },

    async listCourseRequests(filter) {
      const where = courseRequestActiveIn(filter);
      const [rows, total] = await Promise.all([
        run(courseRequestRowsQuery(where, sql`cr.created_at desc, cr.id desc`, filter)),
        countOf(run, sql`select count(*) as total from course_requests cr where ${where}`),
      ]);
      return { rows: rows.map(toCourseRequestRow), total };
    },

    async getCourseRequest(id) {
      const [[found], events, usageRecords, productEvents] = await Promise.all([
        run(courseRequestRowsQuery(sql`cr.id = ${id}::uuid`, sql`cr.id`)),
        pipelineEventRows(sql`select pe.id, row_number() over (order by pe.started_at, pe.id) as ord
          from pipeline_events pe where pe.course_request_id = ${id}::uuid`),
        usageRecordRows(sql`pe.course_request_id = ${id}::uuid`, sql`u.created_at, u.id`),
        run(sql`select p.id, p.created_at as "createdAt", p.kind, p.learner_id as "learnerId",
            p.course_request_id as "courseRequestId", p.detail
          from product_events p where p.course_request_id = ${id}::uuid order by p.created_at, p.id`),
      ]);
      if (!found) return null;
      return { ...toCourseRequestRow(found), events, usageRecords, productEvents: productEvents.map(toProductEventRow) };
    },

    async listFailures(range) {
      const samples = sql.raw(String(FAILURE_SAMPLE_SIZE));
      const [records, events, requests] = await Promise.all([
        run(sql`select u.outcome, u.invalid_cause as "invalidCause", u.http_status as "httpStatus", u.model_id as key,
            count(u.id) as count, max(u.created_at) as "lastAt", coalesce(sum(u.cost_usd), 0) as "wastedUsd",
            to_json((array_agg(u.id order by u.created_at desc))[1:${samples}]) as "sampleIds"
          from usage_records u where ${inRange("u.created_at", range)} and u.outcome <> 'ok'
          group by 1, 2, 3, 4`),
        run(sql`select pe.kind as key, split_part(coalesce(pe.error, ''), chr(10), 1) as error, count(pe.id) as count,
            max(coalesce(pe.finished_at, pe.started_at)) as "lastAt",
            to_json((array_agg(pe.id order by pe.started_at desc))[1:${samples}]) as "sampleIds"
          from pipeline_events pe where ${inRange("pe.started_at", range)} and pe.status = 'failed'
          group by 1, 2`),
        run(sql`select a.route as key, a.status_code as status, count(a.id) as count, max(a.created_at) as "lastAt",
            to_json((array_agg(a.id order by a.created_at desc))[1:${samples}]) as "sampleIds"
          from api_requests a where ${inRange("a.created_at", range)} and a.status_code >= 500
          group by 1, 2`),
      ]);
      return mergeFailureGroups([
        ...records.map((row): OpsFailureGroup => ({
          source: "usage_record",
          reason: usageFailureReason({
            outcome: String(row.outcome),
            invalidCause: toText(row.invalidCause),
            httpStatus: row.httpStatus === null || row.httpStatus === undefined ? null : toNumber(row.httpStatus),
          }),
          key: String(row.key),
          count: toNumber(row.count),
          lastAt: toIso(row.lastAt),
          wastedUsd: toNumber(row.wastedUsd),
          sampleIds: toIdList(row.sampleIds),
        })),
        ...events.map((row): OpsFailureGroup => ({
          source: "pipeline_event",
          reason: pipelineFailureReason(toText(row.error)),
          key: String(row.key),
          count: toNumber(row.count),
          lastAt: toIso(row.lastAt),
          wastedUsd: 0,
          sampleIds: toIdList(row.sampleIds),
        })),
        ...requests.map((row): OpsFailureGroup => ({
          source: "api_request",
          reason: `http ${toNumber(row.status)}`,
          key: String(row.key),
          count: toNumber(row.count),
          lastAt: toIso(row.lastAt),
          wastedUsd: 0,
          sampleIds: toIdList(row.sampleIds),
        })),
      ]);
    },

    async listProductEvents(filter) {
      const conditions: SQL[] = [inRange("p.created_at", filter)];
      if (filter.kind) conditions.push(sql`p.kind = ${filter.kind}`);
      const where = allOf(conditions);
      const [rows, total] = await Promise.all([
        run(sql`select p.id, p.created_at as "createdAt", p.kind, p.learner_id as "learnerId",
            p.course_request_id as "courseRequestId", p.detail
          from product_events p where ${where}
          order by p.created_at desc, p.id desc limit ${filter.limit} offset ${filter.offset}`),
        countOf(run, sql`select count(*) as total from product_events p where ${where}`),
      ]);
      return { rows: rows.map(toProductEventRow), total };
    },

    async listApiRequests(filter) {
      const conditions: SQL[] = [inRange("a.created_at", filter)];
      if (filter.route) conditions.push(sql`a.route = ${filter.route}`);
      if (filter.errorsOnly) conditions.push(sql`a.status_code >= 500`);
      const where = allOf(conditions);
      const [rows, total] = await Promise.all([
        run(sql`select a.id, a.created_at as "createdAt", a.method, a.route, a.url, a.status_code as "statusCode",
            a.duration_ms as "durationMs", a.error
          from api_requests a where ${where}
          order by a.created_at desc, a.id desc limit ${filter.limit} offset ${filter.offset}`),
        countOf(run, sql`select count(*) as total from api_requests a where ${where}`),
      ]);
      return { rows: rows.map(toApiRequestRow), total };
    },

    async listApiRoutes(range) {
      const rows = await run(sql`select a.method, a.route, count(a.id) as count,
          count(a.id) filter (where a.status_code >= 500) as errors,
          percentile_cont(0.5) within group (order by a.duration_ms::double precision) as "p50Ms",
          percentile_cont(0.95) within group (order by a.duration_ms::double precision) as "p95Ms",
          max(a.duration_ms) as "maxMs"
        from api_requests a where ${inRange("a.created_at", range)}
        group by 1, 2 order by 3 desc, 2, 1`);
      return rows.map(toApiRouteRow);
    },
  };
}

/**
 * Wraps the Drizzle database as a SQL runner.
 * @param db - The Drizzle client
 * @returns A runner that executes raw SQL and returns plain rows
 */
export function runnerFor(db: Database): SqlRunner {
  return async (query) => {
    try {
      return [...(await db.execute<SqlRow>(query))];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[ops-store.ts: runnerFor] Usage Console query failed || ${message}`);
    }
  };
}
