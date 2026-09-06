import pino from "pino";
import { createDb, learners, loadRootEnv } from "@senoy/db";

const log = pino({ name: "worker" });

/**
 * Connects to hosted Postgres, confirms the seeded Learner, then waits.
 * Course-generation claiming lands in a later ticket.
 */
async function startWorker() {
  try {
    loadRootEnv(import.meta.url, 3);

    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");
    }

    const db = createDb(url, { max: 1 });
    const rows = await db.select({ id: learners.id }).from(learners).limit(1);

    if (rows.length === 0 || !rows[0]) {
      throw new Error("Worker found no Learner. Run pnpm db:seed.");
    }

    log.info(`worker ready; connected as Learner ${rows[0].id}; idle`);

    await new Promise(() => {
      /* stay alive until the process is stopped */
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`[index.ts: startWorker] Worker failed to start || ${message}`);
    process.exit(1);
  }
}

await startWorker();
