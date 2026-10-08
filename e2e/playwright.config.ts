import { defineConfig, devices } from "@playwright/test";

const API_PORT = 3190;
const WEB_PORT = 4190;

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
      env: { PORT: String(API_PORT), DATABASE_URL: process.env.DATABASE_URL },
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
