import { defineConfig, devices } from "@playwright/test";

const API_PORT = 3190;
const WEB_PORT = 4190;
const WORKER_PORT = 3191;

/** How long each fixture Lesson takes in the worker, so tests can see and cancel a job mid-run. */
export const FIXTURE_LESSON_DELAY_MS = 3500;

if (!process.env.DATABASE_URL?.includes("127.0.0.1")) {
  throw new Error("Run browser tests with `pnpm test:e2e`; it starts a throwaway database.");
}

/** One worker: every test resets the same throwaway database. */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @senoy/api start",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { PORT: String(API_PORT), DATABASE_URL: process.env.DATABASE_URL, DIAGNOSTIC_FIXTURE: "1" },
      reuseExistingServer: false,
    },
    {
      // The worker claims generation jobs; fixture generation makes no provider calls.
      command: "pnpm --filter @senoy/worker start",
      url: `http://127.0.0.1:${WORKER_PORT}/health`,
      env: {
        WORKER_PORT: String(WORKER_PORT), DATABASE_URL: process.env.DATABASE_URL, DIAGNOSTIC_FIXTURE: "1",
        FIXTURE_LESSON_DELAY_MS: String(FIXTURE_LESSON_DELAY_MS),
      },
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @senoy/web exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { API_URL: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});
