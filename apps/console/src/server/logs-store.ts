import type { OpsPage } from "@senoy/db";
import type { OpsLogEntryRow } from "@senoy/db/logs";
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
 * The store over the console's SQL runner.
 * @param run - The runner the other Usage Console reads share
 * @returns The store
 */
export function createLogsStore(run: SqlRunner): LogsStore {
  // Stub (SEN-116): job 04 writes the query.
  void run;
  return {
    async list() {
      return { rows: [], total: 0 };
    },
  };
}
