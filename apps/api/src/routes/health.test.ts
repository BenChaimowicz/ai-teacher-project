import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { healthRoutes } from "./health.ts";

test("GET /api/health returns ok without a Learner", async () => {
  const app = Fastify();
  try {
    await app.register(healthRoutes);
    const response = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
  } finally {
    await app.close();
  }
});
