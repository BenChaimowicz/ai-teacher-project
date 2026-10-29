import assert from "node:assert/strict";
import { hostname } from "node:os";
import { test } from "node:test";
import { jobOwner } from "./generation-job.ts";

test("A stack's job owner is JOB_OWNER, else the Railway environment both services share, else this machine's hostname", () => {
  assert.equal(jobOwner({ JOB_OWNER: " ben ", RAILWAY_ENVIRONMENT_ID: "env1" }), "ben");
  assert.equal(jobOwner({ RAILWAY_ENVIRONMENT_ID: "env1" }), "railway:env1", "The API and worker services agree without setup.");
  assert.equal(jobOwner({ JOB_OWNER: " " }), hostname(), "A blank JOB_OWNER is unset.");
  assert.equal(jobOwner({}), hostname());
});
