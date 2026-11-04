import { sql, type SQL } from "drizzle-orm";
import type { OpsPage } from "@senoy/db";
import type { OpsLogEntryRow } from "@senoy/db/logs";
import { escapeLike, toIso, toNumber, toText, type SqlRow } from "./format.ts";
import type { SqlRunner } from "./ops-store.ts";
import type { LogFilter } from "./query.ts";

/**
 * The Logs view's door to `log_entries` (ADR 0029). Every query is bounded by the filter's time range, newest first
 * (`logged_at desc, id desc`), and uses the table's indexes: one per id filter, plus time, level and component. `q` is a
 * case-insensitive `ilike` on the message, its `%` and `_` escaped.
 */

/** What `GET /api/ops/logs` reads. */
export type LogsStore = {
  /**
   * One page of Log Entries matching every filter, and how many match in all. `pipelineEventId` matches the event
   * and every step nested under it.
   * @param filter - Checked filters
   */
  list(filter: LogFilter): Promise<OpsPage<OpsLogEntryRow>>;
};

/**
 * Builds the `where` of a Log Entry list from its filters. The time range is always present.
 * @param filter - Checked filters
 * @returns The predicate over `log_entries` aliased `l`
 */
export function logEntryWhere(filter: LogFilter): SQL {
  const conditions: SQL[] = [
    sql`l.logged_at >= ${filter.from}::timestamptz`,
    sql`l.logged_at < ${filter.to}::timestamptz`,
  ];
  if (filter.component) conditions.push(sql`l.component = ${filter.component}`);
  // The enum is declared in severity order, so `>=` means "this level and worse".
  if (filter.level) conditions.push(sql`l.level >= ${filter.level}::log_level`);
  if (filter.requestId) conditions.push(sql`l.request_id = ${filter.requestId}::uuid`);
  if (filter.jobId) conditions.push(sql`l.generation_job_id = ${filter.jobId}::uuid`);
  if (filter.courseRequestId) conditions.push(sql`l.course_request_id = ${filter.courseRequestId}::uuid`);
  if (filter.learnerId) conditions.push(sql`l.learner_id = ${filter.learnerId}::uuid`);
  if (filter.pipelineEventId) {
    // The event and everything nested under it, as the Usage Record list does.
    conditions.push(sql`l.pipeline_event_id in (
      with recursive subtree as (
        select ${filter.pipelineEventId}::uuid as id
        union all
        select child.id from pipeline_events child join subtree on child.parent_id = subtree.id
      )
      select id from subtree)`);
  }
  if (filter.q) conditions.push(sql`l.message ilike ${`%${escapeLike(filter.q)}%`}`);
  return sql.join(conditions, sql` and `);
}

/**
 * Selects one page of Log Entries, newest first.
 * @param filter - Checked filters
 * @returns The query
 */
export function logEntryListQuery(filter: LogFilter): SQL {
  return sql`select l.id, l.logged_at as "loggedAt", l.component, l.level, l.message, l.context,
      l.request_id as "requestId", l.generation_job_id as "jobId", l.course_request_id as "courseRequestId",
      l.learner_id as "learnerId", l.pipeline_event_id as "pipelineEventId"
    from log_entries l
    where ${logEntryWhere(filter)}
    order by l.logged_at desc, l.id desc
    limit ${filter.limit} offset ${filter.offset}`;
}

/**
 * Maps one `log_entries` row to the contract row.
 * @param row - Row from `logEntryListQuery`
 * @returns The contract row
 */
export function toLogEntryRow(row: SqlRow): OpsLogEntryRow {
  const context = row.context;
  return {
    id: String(row.id),
    loggedAt: toIso(row.loggedAt),
    component: String(row.component) as OpsLogEntryRow["component"],
    level: String(row.level) as OpsLogEntryRow["level"],
    message: String(row.message),
    context: context && typeof context === "object" ? (context as Record<string, unknown>) : null,
    requestId: toText(row.requestId),
    jobId: toText(row.jobId),
    courseRequestId: toText(row.courseRequestId),
    learnerId: toText(row.learnerId),
    pipelineEventId: toText(row.pipelineEventId),
  };
}

/**
 * The store over the console's SQL runner.
 * @param run - The runner the other Usage Console reads share
 * @returns The store
 */
export function createLogsStore(run: SqlRunner): LogsStore {
  return {
    async list(filter) {
      const [rows, counted] = await Promise.all([
        run(logEntryListQuery(filter)),
        run(sql`select count(*) as total from log_entries l where ${logEntryWhere(filter)}`),
      ]);
      return { rows: rows.map(toLogEntryRow), total: toNumber(counted[0]?.total) };
    },
  };
}
