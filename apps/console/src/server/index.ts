import { createDb, loadRootEnv } from "@senoy/db";
import { buildConsoleApp } from "./app.ts";
import { createOpsStore, runnerFor } from "./ops-store.ts";

/**
 * Starts the Usage Console API (`/api/ops/*`) on `CONSOLE_API_PORT` (default 3100). The console's Vite dev server
 * proxies `/api` here. Reads the same Postgres as the Learner API, with a small pool.
 */
async function start() {
  // apps/console/src/server → repo root is four directories up.
  loadRootEnv(import.meta.url, 4);
  const operatorKey = process.env.OPERATOR_KEY || undefined;
  const app = buildConsoleApp(
    createOpsStore(runnerFor(createDb(requireDatabaseUrl(), { max: 3 }))),
    { operatorKey, logger: true },
  );

  try {
    const port = Number(process.env.CONSOLE_API_PORT ?? 3100);
    const host = process.env.HOST ?? "127.0.0.1";
    await app.listen({ port, host });
    if (!operatorKey) app.log.warn("[index.ts: start] OPERATOR_KEY is unset, so the Usage Console is open to anyone who can reach it");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    app.log.error(`[index.ts: start] Failed to start the Usage Console API || ${message}`);
    process.exit(1);
  }
}

/**
 * Reads `DATABASE_URL`.
 * @returns The connection string
 * @throws Error when it is not set
 */
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("[index.ts: requireDatabaseUrl] DATABASE_URL is not set || file=.env at the repo root");
  return url;
}

await start();
