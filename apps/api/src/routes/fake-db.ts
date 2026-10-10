import { randomUUID } from "node:crypto";
import { getTableColumns, getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import type { Database } from "@senoy/db";

/** Stored rows of one table, keyed by Drizzle field name. */
type Row = Record<string, unknown>;

/**
 * In-memory stand-in for the Drizzle calls routes make: insert/returning, select/where/orderBy (newest first only)/limit,
 * and conditional update/returning. Evaluates only equality and `is null` predicates.
 * @param tables - Tables the routes under test touch
 */
export function fakeDb(tables: PgTable[]) {
  const dialect = new PgDialect();
  const rows = new Map<PgTable, Row[]>(tables.map((table) => [table, []]));
  /** Column name → field key, per table name. */
  const fieldsByTable = new Map(tables.map((table) => [
    getTableName(table),
    new Map(Object.entries(getTableColumns(table)).map(([key, column]) => [column.name, key])),
  ]));
  const inserts: { table: PgTable; values: Row }[] = [];

  /** Projects the selected columns, as Postgres does. */
  function project(table: PgTable, row: Row, fields?: Record<string, PgColumn>) {
    if (!fields) return { ...row };
    const keys = fieldsByTable.get(getTableName(table))!;
    return Object.fromEntries(Object.entries(fields).map(([alias, column]) => [alias, row[keys.get(column.name)!]]));
  }

  /** Evaluates equality and null predicates against one row. */
  function matches(table: PgTable, row: Row, condition: SQL) {
    const query = dialect.sqlToQuery(condition);
    const keys = fieldsByTable.get(getTableName(table))!;
    return [...query.sql.matchAll(/"(\w+)"\."(\w+)"\s*(=\s*\$(\d+)|is null)/gi)].every((match) => {
      if (match[1] !== getTableName(table)) return true;
      const value = row[keys.get(match[2]!)!];
      if (!match[4]) return value === null || value === undefined;
      const expected = query.params[Number(match[4]) - 1];
      return typeof value === "object" && value !== null && !(value instanceof Date)
        ? JSON.stringify(value) === (typeof expected === "string" ? expected : JSON.stringify(expected))
        : value === expected;
    });
  }

  /** Fills defaults the database would supply. */
  function withDefaults(table: PgTable, values: Row): Row {
    const row: Row = {};
    for (const [key, column] of Object.entries(getTableColumns(table))) {
      if (values[key] !== undefined) row[key] = values[key];
      else if (column.primary) row[key] = randomUUID();
      else if (column.hasDefault && column.default !== undefined && typeof column.default !== "object") row[key] = column.default;
      else if (column.hasDefault && Array.isArray(column.default)) row[key] = [];
      else if (column.hasDefault) row[key] = new Date();
      else row[key] = null;
    }
    return row;
  }

  const db = {
    insert: (table: PgTable) => ({
      values: (values: Row) => ({
        returning: async (fields?: Record<string, PgColumn>) => {
          const row = withDefaults(table, values);
          rows.get(table)!.push(row);
          inserts.push({ table, values });
          return [project(table, row, fields)];
        },
      }),
    }),
    select: (fields?: Record<string, PgColumn>) => ({
      from: (table: PgTable) => ({
        where: (condition: SQL) => {
          let result = (rows.get(table) ?? []).filter((row) => matches(table, row, condition));
          const query = {
            orderBy: () => {
              result = [...result].reverse();
              return query;
            },
            limit: async (count: number) => result.slice(0, count).map((row) => project(table, row, fields)),
            then: (resolve: (value: unknown) => unknown) => resolve(result.map((row) => project(table, row, fields))),
          };
          return query;
        },
      }),
    }),
    update: (table: PgTable) => ({
      set: (changes: Row) => ({
        where: (condition: SQL) => ({
          returning: async (fields?: Record<string, PgColumn>) =>
            rows.get(table)!.filter((row) => matches(table, row, condition)).map((row) => {
              Object.assign(row, changes);
              return project(table, row, fields);
            }),
        }),
      }),
    }),
  };
  return { db: db as unknown as Database, rows, inserts };
}
