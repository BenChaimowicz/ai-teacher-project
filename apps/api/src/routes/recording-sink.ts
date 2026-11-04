import { randomUUID } from "node:crypto";
import { setImmediate as nextTurn } from "node:timers/promises";
import type { ProductEventKind } from "@senoy/db";
import { installUsageTracking, type ProductEventRow, type UsageSink } from "../lib/usage-tracking.ts";

/**
 * A usage sink for route tests: records Product Events and counts Pipeline Events while installed.
 * Product events are fired without waiting (`void recordProductEvent(...)`), so read them after {@link settled}.
 */
export function recordingSink() {
  const events: ProductEventRow[] = [];
  let pipelineEvents = 0;
  const sink: UsageSink = {
    async startPipelineEvent() { pipelineEvents += 1; return randomUUID(); },
    async finishPipelineEvent() {},
    async insertUsageRecord() {},
    async setUsageMeasurement() {},
    async insertProductEvent(row) { events.push(row); },
    async insertApiRequest() {},
  };
  return { sink, events, pipelineEvents: () => pipelineEvents };
}

/**
 * Installs a {@link recordingSink} as the process-wide sink. Call `uninstall` in `finally`.
 * @returns The recorded events, a reader for one kind, and the uninstaller
 */
export function recordProductEvents() {
  const recording = recordingSink();
  const uninstall = installUsageTracking({ sink: recording.sink, log: { error() {} } });
  return {
    events: recording.events,
    /** Every recorded event of one kind, oldest first. */
    of: (kind: ProductEventKind) => recording.events.filter((event) => event.kind === kind),
    uninstall,
  };
}

/** Lets fire-and-forget event writes (and the lookups before them) finish. */
export async function settled() {
  for (let turn = 0; turn < 5; turn += 1) await nextTurn();
}
