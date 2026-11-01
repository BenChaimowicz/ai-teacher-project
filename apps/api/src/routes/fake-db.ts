import { randomUUID } from "node:crypto";
import { getTableColumns, getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import type { Database } from "@senoy/db";

/** Stored rows of one table, keyed by Drizzle field name. */
type Row = Record<string, unknown>;

/**
 * In-memory stand-in for the Drizzle calls routes make: insert of one row or many (awaited, with returning, as an
 * `onConflictDoUpdate` upsert, or as an `onConflictDoNothing` insert with returning),
 * select/where/orderBy (newest first only)/limit, conditional update/returning, conditional delete, and a transaction that restores every
 * table if its callback throws. Evaluates equality, `is null`, and timestamp `<`/`>` predicates, and treats every
 * condition in a `where` as a conjunction: `or(...)` is not supported.
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

  /** Milliseconds for a timestamp held as a Date, or as the string Drizzle sends one as. */
  function instant(value: unknown) {
    return value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  }

  /** Evaluates equality, null, and timestamp ordering predicates against one row, as a conjunction. */
  function matches(table: PgTable, row: Row, condition: SQL) {
    const query = dialect.sqlToQuery(condition);
    const keys = fieldsByTable.get(getTableName(table))!;
    return [...query.sql.matchAll(/"(\w+)"\."(\w+)"\s*(?:([=<>])\s*\$(\d+)|is null)/gi)].every((match) => {
      if (match[1] !== getTableName(table)) return true;
      const value = row[keys.get(match[2]!)!];
      if (!match[4]) return value === null || value === undefined;
      const expected = query.params[Number(match[4]) - 1];
      if (match[3] !== "=") {
        if (value === null || value === undefined) return false;
        return match[3] === "<" ? instant(value) < instant(expected) : instant(value) > instant(expected);
      }
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
      values: (values: Row | Row[]) => {
        /** Stores each row with database defaults. */
        function insert() {
          return (Array.isArray(values) ? values : [values]).map((value) => {
            const row = withDefaults(table, value);
            rows.get(table)!.push(row);
            inserts.push({ table, values: value });
            return row;
          });
        }
        /** Updates the row whose `target` columns match each value instead of inserting it, as a unique key would. */
        function upsert({ target, set }: { target: PgColumn[]; set: Row }) {
          const keys = fieldsByTable.get(getTableName(table))!;
          const targetKeys = target.map((column) => keys.get(column.name)!);
          for (const value of Array.isArray(values) ? values : [values]) {
            const existing = rows.get(table)!.find((row) => targetKeys.every((key) => row[key] === value[key]));
            if (existing) Object.assign(existing, set);
            else {
              rows.get(table)!.push(withDefaults(table, value));
              inserts.push({ table, values: value });
            }
          }
        }
        /** Inserts the rows whose `target` columns match no stored row, as a unique key would, and skips the rest. */
        function insertNew({ target }: { target: PgColumn | PgColumn[] }) {
          const keys = fieldsByTable.get(getTableName(table))!;
          const targetKeys = (Array.isArray(target) ? target : [target]).map((column) => keys.get(column.name)!);
          return (Array.isArray(values) ? values : [values]).flatMap((value) => {
            if (rows.get(table)!.some((row) => targetKeys.every((key) => row[key] === value[key]))) return [];
            const row = withDefaults(table, value);
            rows.get(table)!.push(row);
            inserts.push({ table, values: value });
            return [row];
          });
        }
        return {
          returning: async (fields?: Record<string, PgColumn>) => insert().map((row) => project(table, row, fields)),
          onConflictDoUpdate: async (config: { target: PgColumn[]; set: Row }) => upsert(config),
          onConflictDoNothing: (config: { target: PgColumn | PgColumn[] }) => ({
            returning: async (fields?: Record<string, PgColumn>) => insertNew(config).map((row) => project(table, row, fields)),
          }),
          then: (resolve: (value: unknown) => unknown) => resolve((insert(), undefined)),
        };
      },
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
    delete: (table: PgTable) => ({
      where: async (condition: SQL) => {
        rows.set(table, rows.get(table)!.filter((row) => !matches(table, row, condition)));
      },
    }),
    /** Runs the callback on this store; a throw restores every table to its state before the call. */
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => {
      const saved = new Map([...rows].map(([table, list]) => [table, list.map((row) => ({ ...row }))]));
      try {
        return await callback(db);
      } catch (error) {
        for (const [table, list] of saved) rows.set(table, list);
        throw error;
      }
    },
  };
  return { db: db as unknown as Database, rows, inserts };
}
