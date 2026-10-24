import assert from "node:assert/strict";
import { test } from "node:test";
import { runResearch, type ResearchAdapter } from "@senoy/research";
import { createResearchMeter, MeasurementSkipped, type FundsProbe, type FundsReading, type MeasuredVendor } from "./research-measurement.ts";
import { installUsageTracking, recordVendorCall, trackResearchRun, beginResearchMeasurement, type UsageSink } from "./usage-tracking.ts";

/**
 * A probe answering each vendor from its own script, in order; an Error entry makes that read throw.
 * @param scripts - Per vendor, the readings to hand out
 */
function scriptedProbe(scripts: Partial<Record<MeasuredVendor, (FundsReading | Error)[]>>): { probe: FundsProbe; reads: MeasuredVendor[] } {
  const reads: MeasuredVendor[] = [];
  const probe: FundsProbe = async (vendor) => {
    reads.push(vendor);
    const next = scripts[vendor]?.shift();
    if (!next) throw new Error(`no scripted reading for ${vendor}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return { probe, reads };
}

/** A sleep that returns at once and keeps the requested waits. */
function instantSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

const funds = (fundsUsd: number, pendingUsd: number | null = null): FundsReading => ({ fundsUsd, pendingUsd });

test("A clean call is measured from the balance drop at the first read after it", async () => {
  const { probe } = scriptedProbe({ you: [funds(88.35), funds(88.30)] });
  const { sleep, waits } = instantSleep();
  const call = createResearchMeter({ probe, sleep }).begin("you");
  call.end();
  assert.deepEqual(await call.result, { measuredCostUsd: 0.05, measurementNote: "You.com balance drop, settled within 3 s" });
  assert.deepEqual(waits, [3000]);
});

test("A delayed charge is caught by the second read", async () => {
  const { probe } = scriptedProbe({ you: [funds(88.35), funds(88.35), funds(88.29)] });
  const { sleep, waits } = instantSleep();
  const call = createResearchMeter({ probe, sleep }).begin("you");
  call.end();
  const result = await call.result;
  assert.equal(result.measuredCostUsd, 0.06);
  assert.match(result.measurementNote, /settled within 15 s/);
  assert.deepEqual(waits, [3000, 12000]);
});

test("A balance that never moves is not measured", async () => {
  const { probe } = scriptedProbe({ you: [funds(88.35), funds(88.35), funds(88.35)] });
  const call = createResearchMeter({ probe, sleep: instantSleep().sleep }).begin("you");
  call.end();
  assert.deepEqual(await call.result, { measuredCostUsd: null, measurementNote: "Not measured: the You.com balance did not move within 15 s of the call ending" });
});

test("Overlapping calls to the same vendor are both unmeasurable; another vendor is unaffected", async () => {
  const { probe } = scriptedProbe({ you: [funds(10), funds(10), funds(9.9), funds(9.9)], parallel: [funds(5), funds(4.9)] });
  const meter = createResearchMeter({ probe, sleep: instantSleep().sleep });
  const first = meter.begin("you");
  const second = meter.begin("you");
  const other = meter.begin("parallel");
  first.end();
  second.end();
  other.end();
  const [a, b, c] = await Promise.all([first.result, second.result, other.result]);
  assert.equal(a.measuredCostUsd, null);
  assert.match(a.measurementNote, /another You\.com call overlapped in this process/);
  assert.equal(b.measuredCostUsd, null);
  assert.match(b.measurementNote, /overlapped/);
  assert.equal(c.measuredCostUsd, 0.1);
});

test("A call started while an earlier one is still settling taints both", async () => {
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const { probe } = scriptedProbe({ you: [funds(10), funds(10), funds(9.95), funds(9.9), funds(9.9)] });
  // The first call's settle reads wait on the gate, so its window is still open when the second starts.
  const meter = createResearchMeter({ probe, sleep: () => gate });
  const first = meter.begin("you");
  first.end();
  const second = meter.begin("you");
  second.end();
  release();
  const [a, b] = await Promise.all([first.result, second.result]);
  assert.match(a.measurementNote, /overlapped/);
  assert.match(b.measurementNote, /overlapped/);
});

test("A failed read before or after the call becomes a note, never an error", async () => {
  const before = createResearchMeter({ probe: scriptedProbe({ you: [new Error("status=503")] }).probe, sleep: instantSleep().sleep }).begin("you");
  before.end();
  assert.deepEqual(await before.result, { measuredCostUsd: null, measurementNote: "Not measured: balance read failed: status=503" });

  const after = createResearchMeter({ probe: scriptedProbe({ you: [funds(10), new Error("timeout")] }).probe, sleep: instantSleep().sleep }).begin("you");
  after.end();
  assert.match((await after.result).measurementNote, /^Not measured: balance read failed: timeout \(after the call\)$/);
});

test("Parallel without a login is skipped with a clear note", async () => {
  const skip = new MeasurementSkipped("no current Parallel login token (run pnpm parallel:login and keep the Usage Console API running)");
  const call = createResearchMeter({ probe: scriptedProbe({ parallel: [skip] }).probe, sleep: instantSleep().sleep }).begin("parallel");
  call.end();
  assert.deepEqual(await call.result, { measuredCostUsd: null, measurementNote: `Not measured: ${skip.message}` });
});

test("Parallel funds still held at the last read are noted as settling", async () => {
  const { probe } = scriptedProbe({ parallel: [funds(20, 0), funds(19.9, 0.04), funds(19.9, 0.04)] });
  const call = createResearchMeter({ probe, sleep: instantSleep().sleep }).begin("parallel");
  call.end();
  const result = await call.result;
  assert.equal(result.measuredCostUsd, 0.1);
  assert.match(result.measurementNote, /settling: \$0\.04 still held by Parallel/);
});

test("The measurement waits for the call to end before reading again", async () => {
  const { probe, reads } = scriptedProbe({ you: [funds(10), funds(9.95)] });
  const call = createResearchMeter({ probe, sleep: instantSleep().sleep }).begin("you");
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(reads, ["you"]);
  call.end();
  await call.result;
  assert.deepEqual(reads, ["you", "you"]);
});

/** A sink keeping Usage Records and measurements. */
function memorySink() {
  const usage: Record<string, unknown>[] = [];
  const measurements: { id: string; measuredCostUsd: number | null; measurementNote: string }[] = [];
  const sink: UsageSink = {
    startPipelineEvent: async () => "event-1",
    finishPipelineEvent: async () => undefined,
    insertUsageRecord: async (row) => void usage.push(row),
    setUsageMeasurement: async (id, measurement) => void measurements.push({ id, ...measurement }),
    insertProductEvent: async () => undefined,
    insertApiRequest: async () => undefined,
  };
  return { sink, usage, measurements };
}

/**
 * Waits until `check` passes (background writes), or fails after a few turns.
 * @param check - Returns true when done
 */
async function eventually(check: () => boolean) {
  for (let turn = 0; turn < 50 && !check(); turn += 1) await new Promise((done) => setImmediate(done));
  assert.ok(check());
}

test("A research Usage Record is stored as measuring, then updated by id with its measured cost", async () => {
  const { sink, usage, measurements } = memorySink();
  const meter = createResearchMeter({ probe: scriptedProbe({ you: [funds(10), funds(9.95)] }).probe, sleep: instantSleep().sleep });
  const uninstall = installUsageTracking({ sink, log: { error: () => undefined }, meter });
  try {
    const measurement = beginResearchMeasurement("you-research");
    assert.ok(measurement);
    measurement.end();
    await recordVendorCall({
      adapter: { id: "you-research", timeoutMs: 1000, estimatedCostUsd: 0.05 }, role: "research_primary", topic: "t",
      status: "ok", responseId: "r1", error: null, response: null, durationMs: 5,
    }, measurement);
    assert.equal(usage.length, 1);
    assert.match(String(usage[0]!.measurementNote), /^Measuring/);
    await eventually(() => measurements.length === 1);
    assert.deepEqual(measurements[0], { id: usage[0]!.id, measuredCostUsd: 0.05, measurementNote: "You.com balance drop, settled within 3 s" });
  } finally {
    uninstall();
  }
});

test("runResearch measures each vendor call from its start to its end and attaches it to that call's record", async () => {
  const { sink, usage, measurements } = memorySink();
  const { probe } = scriptedProbe({ parallel: [funds(20), funds(19.9)], you: [funds(10), funds(9.95)] });
  const uninstall = installUsageTracking({ sink, log: { error: () => undefined }, meter: createResearchMeter({ probe, sleep: instantSleep().sleep }) });
  const adapter = (id: "parallel-pro" | "you-research", envKey: string): ResearchAdapter => ({
    id, envKey, estimatedCostUsd: 0.1, timeoutMs: 1000,
    research: async () => ({ sources: [{ url: `https://example.org/${id}`, title: null, excerpts: ["x"] }], summary: null, requestId: `${id}-req` }),
  });
  try {
    await runResearch("topic", {
      primary: adapter("parallel-pro", "P"), secondary: adapter("you-research", "Y"), env: { P: "k1", Y: "k2" },
      fetch: (async () => new Response("{}", { status: 404 })) as typeof fetch,
      ...trackResearchRun(),
    });
    await eventually(() => measurements.length === 2);
    const byResponse = Object.fromEntries(usage.map((row) => [row.responseId, row.id]));
    const byId = Object.fromEntries(measurements.map((row) => [row.id, row.measuredCostUsd]));
    assert.equal(byId[String(byResponse["parallel-pro-req"])], 0.1);
    assert.equal(byId[String(byResponse["you-research-req"])], 0.05);
  } finally {
    uninstall();
  }
});

test("Without tracking installed nothing is measured and no balance is read", () => {
  assert.equal(beginResearchMeasurement("you-research"), null);
});
