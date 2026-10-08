import { execFileSync, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

/**
 * Browser tests against a throwaway Postgres: start a Docker container, migrate, run Playwright, remove the container.
 * Your `.env` database is never touched. Extra arguments go to `playwright test`.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const container = `senoy-e2e-${process.pid}`;
const password = "e2e";

/**
 * Runs docker and returns trimmed stdout.
 * @param args - docker arguments
 */
function docker(...args: string[]) {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}

/**
 * Waits until Postgres in the container accepts connections after its init restart.
 */
async function waitForPostgres() {
  for (let i = 0; i < 60; i += 1) {
    const logs = spawnSync("docker", ["logs", container], { encoding: "utf8" });
    const ready = `${logs.stdout}${logs.stderr}`.split("ready to accept connections").length - 1;
    if (ready >= 2) return;
    await sleep(500);
  }
  throw new Error("Postgres did not become ready in 30s.");
}

let status = 1;
try {
  docker(
    "run", "-d", "--rm", "--name", container,
    "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=senoy",
    "-p", "127.0.0.1::5432", "postgres:17-alpine",
  );
  const port = docker("port", container, "5432/tcp").split("\n")[0]!.split(":").at(-1);
  await waitForPostgres();

  const env = { ...process.env, DATABASE_URL: `postgres://postgres:${password}@127.0.0.1:${port}/senoy` };
  const migrate = spawnSync("pnpm", ["--filter", "@senoy/db", "migrate"], { env, stdio: "inherit" });
  if (migrate.status !== 0) throw new Error("Migrations failed.");

  const run = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], {
    cwd: here,
    env,
    stdio: "inherit",
  });
  status = run.status ?? 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[run.ts] E2E run failed || ${message}`);
} finally {
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}

process.exit(status);
