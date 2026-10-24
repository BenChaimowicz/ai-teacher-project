import { createDb, loadRootEnv } from "@senoy/db";
import { createParallelTokenKeeper, parallelAccountPath } from "@senoy/research";
import { buildConsoleApp } from "./app.ts";
import { createBillingService, vendorReadersFromEnv } from "./billing.ts";
import { createOpsStore, runnerFor } from "./ops-store.ts";
import { createOpenRouterHistoryReader } from "./openrouter-history.ts";
import { createSetupReader } from "./setup.ts";

/**
 * Starts the Usage Console API (`/api/ops/*`) on `CONSOLE_API_PORT` (default 3100). The console's Vite dev server
 * proxies `/api` here. Reads the same Postgres as the Learner API, with a small pool. While it runs it takes vendor
 * balance readings (billing check) and keeps the Parallel Account API token fresh: it is that file's only writer.
 */
async function start() {
  // apps/console/src/server → repo root is four directories up.
  const root = loadRootEnv(import.meta.url, 4);
  const run = runnerFor(createDb(requireDatabaseUrl(), { max: 3 }));
  const keeper = createParallelTokenKeeper({ path: parallelAccountPath(root) });
  const billing = createBillingService({ run, readers: vendorReadersFromEnv({ env: process.env, keeper }), keeper });
  const app = buildConsoleApp(createOpsStore(run), { logger: true, setup: createSetupReader({ env: process.env }), billing,
    openrouterHistory: createOpenRouterHistoryReader(run) });

  try {
    const port = Number(process.env.CONSOLE_API_PORT ?? 3100);
    // It has no key and shows every prompt and cost, so it never listens beyond this machine.
    const host = "127.0.0.1";
    await app.listen({ port, host });
    billing.start(app.log);
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
