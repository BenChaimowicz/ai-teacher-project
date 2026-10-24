import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLimiter } from "./ops-store.ts";

describe("Query limiter", () => {
  it("never runs more tasks at once than its limit, and runs every task", async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;
    const task = (ms: number) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, ms));
      active -= 1;
      return ms;
    };
    const results = await Promise.all([5, 1, 8, 2, 4, 3, 6, 7, 9, 1, 2, 3].map((ms) => limit(task(ms))));
    assert.equal(peak, 3);
    assert.equal(results.length, 12);
  });

  it("frees the slot when a task fails", async () => {
    const limit = createLimiter(1);
    await assert.rejects(limit(async () => { throw new Error("boom"); }), /boom/);
    assert.equal(await limit(async () => "next"), "next");
  });
});
