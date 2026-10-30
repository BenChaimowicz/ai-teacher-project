import { createServer } from "node:http";
import pino from "pino";
import { createDb, DEFAULT_POOL_SIZE, loadRootEnv, warmDb } from "@senoy/db";
import { createFixtureBlueprintBuilder } from "@senoy/api/blueprint-fixture";
import { createBlueprintJob } from "@senoy/api/blueprint-job";
import { createCourseGeneration } from "@senoy/api/course-generation";
import { createFixtureCourseGeneration } from "@senoy/api/course-generation-fixture";
import { createGenerationWorker } from "@senoy/api/generation-worker";
import { balanceProbeFromEnv, createResearchMeter } from "@senoy/api/research-measurement";
import { installUsageTracking } from "@senoy/api/usage-tracking";

const log = pino({ name: "worker" });

/**
 * Connects to hosted Postgres, then claims Blueprint and Course-generation jobs until stopped.
 * `WORKER_PORT`, when set, serves `GET /health` so a supervisor (or the browser tests) can tell the worker is up.
 */
async function startWorker() {
  try {
    const root = loadRootEnv(import.meta.url, 3);

    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");
    }

    // More connections than a run has queries in flight, so postgres.js never pipelines one onto a busy connection,
    // which the Supabase pooler can lose (SEN-70, SEN-93). All open now, so the first claim doesn't pay setup (SEN-103).
    const db = createDb(url, { max: DEFAULT_POOL_SIZE });
    await warmDb(db, DEFAULT_POOL_SIZE);
    installUsageTracking({
      db,
      log,
      // Research calls are measured against the vendor balance; this process only reads the Parallel token file.
      meter: createResearchMeter({ probe: balanceProbeFromEnv({ env: process.env, repoRoot: root }) }),
    });

    // Browser tests run the real pipeline and publish with fixed research, Generators, and Judge; never set
    // DIAGNOSTIC_FIXTURE in a deployed service.
    const fixtures = process.env.DIAGNOSTIC_FIXTURE === "1";
    const blueprint = createBlueprintJob(fixtures ? createFixtureBlueprintBuilder() : undefined);
    const generation = fixtures
      ? createFixtureCourseGeneration(Number(process.env.FIXTURE_LESSON_DELAY_MS ?? 0))
      : createCourseGeneration();
    const worker = createGenerationWorker({
      db,
      blueprint,
      generation,
      log,
      leaseMs: process.env.GENERATION_LEASE_MS ? Number(process.env.GENERATION_LEASE_MS) : undefined,
    });

    const port = process.env.WORKER_PORT;
    const health = port
      ? createServer((request, response) => {
          response.writeHead(request.url === "/health" ? 200 : 404, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ ok: request.url === "/health" }));
        }).listen(Number(port), "127.0.0.1")
      : null;

    /** Hands a job in progress back to the queue, then exits. */
    const shutdown = async () => {
      log.info("worker stopping");
      await worker.stop();
      health?.close();
      process.exit(0);
    };
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
    // Closing the terminal window: on Windows, Node has about 10 s before the process is killed outright.
    process.once("SIGHUP", () => void shutdown());

    log.info("worker ready; claiming Blueprint and generation jobs");
    await worker.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`[index.ts: startWorker] Worker failed to start || ${message}`);
    process.exit(1);
  }
}

await startWorker();
