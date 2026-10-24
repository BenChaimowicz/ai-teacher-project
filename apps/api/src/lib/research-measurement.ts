import {
  currentParallelAccessToken,
  parallelAccountPath,
  parallelFundsUsd,
  readParallelBalance,
  readYouBalance,
} from "@senoy/research";

/**
 * Measures what one research call really cost by reading the vendor's balance just before it and again after it
 * (SEN-70). The research call never waits on any of this: the "before" read starts alongside the call, the "after"
 * reads run in the background once it ends, and every failure becomes a note instead of an error.
 *
 * A measurement is only trusted when no other call to the same vendor ran in this process while it was open (from its
 * start until its charge showed up or the settle window ran out). Calls from another process (the Learner API vs the
 * worker), or another app on the same account, are invisible to that check.
 */

/** The research vendors whose balance we can read. */
export type MeasuredVendor = "you" | "parallel";

/** Money counted against us at one instant, in USD. `pendingUsd` is Parallel's held funds. */
export type FundsReading = { fundsUsd: number; pendingUsd: number | null };

/** Reads a vendor's funds. Throws `MeasurementSkipped` when it cannot be read at all (no credentials). */
export type FundsProbe = (vendor: MeasuredVendor) => Promise<FundsReading>;

/** What gets written onto the Usage Record. */
export type Measurement = { measuredCostUsd: number | null; measurementNote: string };

/** One call being measured. */
export type MeasuredCall = {
  /** Call as soon as the vendor call ends (answered, failed, or timed out). Idempotent. */
  end(): void;
  /** Settles once the measurement is final; never rejects. */
  readonly result: Promise<Measurement>;
};

/** Hands out measurements and tracks overlap per vendor. */
export type ResearchMeter = { begin(vendor: MeasuredVendor): MeasuredCall };

/** Thrown by a probe when the vendor cannot be read in this process (a clear note, not an error). */
export class MeasurementSkipped extends Error {
  /** @param message - Why */
  constructor(message: string) {
    super(message);
    this.name = "MeasurementSkipped";
  }
}

/** When to read after the call ends, in ms after it ended. You.com can take a few seconds to charge. */
export const SETTLE_READS_MS = [3_000, 15_000] as const;

/** Time limit for one balance read during measurement. */
const READ_TIMEOUT_MS = 4_000;

/** Below this a balance has not moved (float noise; vendors bill in cents or finer). */
const EPSILON_USD = 1e-6;

/** Vendor names for notes. */
const VENDOR_NAMES: Record<MeasuredVendor, string> = { you: "You.com", parallel: "Parallel" };

/**
 * USD with up to 4 decimals, for notes.
 * @param usd - Amount
 */
function money(usd: number) {
  return `$${usd.toFixed(4).replace(/0{1,2}$/, "")}`;
}

/** A probe answer that cannot throw. */
type Settled = { ok: true; reading: FundsReading } | { ok: false; error: string };

/**
 * Runs the probe, turning any failure into a value.
 * @param probe - Funds probe
 * @param vendor - Vendor
 */
async function settle(probe: FundsProbe, vendor: MeasuredVendor): Promise<Settled> {
  try {
    return { ok: true, reading: await probe(vendor) };
  } catch (error) {
    if (error instanceof MeasurementSkipped) return { ok: false, error: error.message };
    return { ok: false, error: `balance read failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Builds a meter. One per process; the overlap check only sees calls begun through the same meter.
 * @param options.probe - Reads a vendor's funds
 * @param options.sleep - Timer seam for tests
 * @param options.settleReadsMs - After-call read times (ms after the call ended), ascending
 */
export function createResearchMeter(options: {
  probe: FundsProbe;
  sleep?: (ms: number) => Promise<void>;
  settleReadsMs?: readonly number[];
}): ResearchMeter {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms).unref?.()));
  const reads = options.settleReadsMs ?? SETTLE_READS_MS;
  const lastReadMs = reads[reads.length - 1] ?? 0;
  /** Open measurement windows per vendor; each flags itself when another call shares its time. */
  const open: Record<MeasuredVendor, Set<{ overlapped: boolean }>> = { you: new Set(), parallel: new Set() };

  return {
    begin(vendor) {
      const window = { overlapped: false };
      if (open[vendor].size > 0) {
        window.overlapped = true;
        for (const other of open[vendor]) other.overlapped = true;
      }
      open[vendor].add(window);
      const name = VENDOR_NAMES[vendor];
      const before = settle(options.probe, vendor);
      let markEnded!: () => void;
      const ended = new Promise<void>((done) => {
        markEnded = done;
      });

      /** Keeps the window open until the charge could no longer land, then closes it. */
      const closeAfter = async (waitedMs: number) => {
        if (waitedMs < lastReadMs) await sleep(lastReadMs - waitedMs);
        open[vendor].delete(window);
      };

      const measure = async (): Promise<Measurement> => {
        await ended;
        const start = await before;
        if (!start.ok) {
          void closeAfter(0);
          return { measuredCostUsd: null, measurementNote: `Not measured: ${start.error}` };
        }
        let waited = 0;
        let last: FundsReading | null = null;
        for (const at of reads) {
          await sleep(at - waited);
          waited = at;
          const after = await settle(options.probe, vendor);
          if (!after.ok) {
            void closeAfter(waited);
            return { measuredCostUsd: null, measurementNote: `Not measured: ${after.error} (after the call)` };
          }
          last = after.reading;
          const moved = start.reading.fundsUsd - last.fundsUsd > EPSILON_USD;
          const holding = (last.pendingUsd ?? 0) > EPSILON_USD;
          if (moved && !holding) break;
        }
        open[vendor].delete(window);
        if (!last) return { measuredCostUsd: null, measurementNote: "Not measured: no read after the call" };
        const drop = start.reading.fundsUsd - last.fundsUsd;
        const settling = (last.pendingUsd ?? 0) > EPSILON_USD ? `; settling: ${money(last.pendingUsd!)} still held by ${name}` : "";
        if (window.overlapped) {
          return {
            measuredCostUsd: null,
            measurementNote: `Not measured: another ${name} call overlapped in this process (balance moved ${money(drop)} across both)${settling}`,
          };
        }
        if (drop < -EPSILON_USD) return { measuredCostUsd: null, measurementNote: `Not measured: the ${name} balance rose by ${money(-drop)} (a top-up?)${settling}` };
        if (drop <= EPSILON_USD) {
          return { measuredCostUsd: null, measurementNote: `Not measured: the ${name} balance did not move within ${Math.round(waited / 1000)} s of the call ending${settling}` };
        }
        return { measuredCostUsd: Math.round(drop * 1e6) / 1e6, measurementNote: `${name} balance drop, settled within ${Math.round(waited / 1000)} s${settling}` };
      };

      const result = measure().catch((error: unknown) => {
        open[vendor].delete(window);
        return { measuredCostUsd: null, measurementNote: `Not measured: ${error instanceof Error ? error.message : String(error)}` };
      });
      return {
        end: () => markEnded(),
        result,
      };
    },
  };
}

/**
 * The production probe: You.com with its API key, Parallel with the Account API token the Usage Console keeps fresh.
 * This process only reads the token file; it never refreshes it.
 * @param options.env - Environment with `YOU_DOT_COM_API_KEY`
 * @param options.repoRoot - Repo root, where `.parallel-account.json` lives
 * @param options.fetch - fetch seam
 */
export function balanceProbeFromEnv(options: {
  env: Record<string, string | undefined>;
  repoRoot: string;
  fetch?: typeof globalThis.fetch;
}): FundsProbe {
  const request = { fetch: options.fetch, timeoutMs: READ_TIMEOUT_MS };
  const accountPath = parallelAccountPath(options.repoRoot);
  return async (vendor) => {
    if (vendor === "you") {
      const key = options.env.YOU_DOT_COM_API_KEY?.trim();
      if (!key) throw new MeasurementSkipped("YOU_DOT_COM_API_KEY is not set");
      const reading = await readYouBalance(key, request);
      return { fundsUsd: reading.balanceUsd, pendingUsd: null };
    }
    const token = await currentParallelAccessToken(accountPath);
    if (!token) throw new MeasurementSkipped("no current Parallel login token (run pnpm parallel:login and keep the Usage Console API running)");
    const reading = await readParallelBalance(token, request);
    return { fundsUsd: parallelFundsUsd(reading), pendingUsd: reading.pendingUsd };
  };
}
