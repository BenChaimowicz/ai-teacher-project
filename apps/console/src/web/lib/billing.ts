import type { BalanceVendor, OpsBilling, OpsVendorBilling } from "@senoy/db/usage";
import { useCallback, useEffect, useState } from "react";
import { ApiError, opsPost } from "@/lib/api";
import { useTimeRange } from "@/lib/range";
import { useOps, type OpsState } from "@/lib/useOps";

/** Gaps within this many dollars count as a match (balance readings round to the cent, timing adds a little). */
export const GAP_TOLERANCE_USD = 0.05;

/** A measured research cost within this of the estimate counts as matching. */
export const MEASURED_TOLERANCE_USD = 0.01;

/** What a vendor's account started with, and whether the vendor reported it or we worked it out. */
export type StartingBalance = { usd: number; exact: boolean };

/**
 * What the account started with: the API's figure when it has one (OpenRouter's credits bought, or what an Operator
 * told us for You.com and Parallel). Otherwise worked out as today's balance plus everything we know was spent
 * (recorded calls and calls rebuilt from stored research), a floor when there were no top-ups in between.
 * @param b - One vendor's billing check
 * @returns The starting balance, or null with no reading yet
 */
export function startingBalance(b: OpsVendorBilling): StartingBalance | null {
  if (b.startingUsd != null) return { usd: b.startingUsd, exact: true };
  const latest = b.latest;
  if (latest?.balanceUsd == null) return null;
  return { usd: latest.balanceUsd + b.recordedAllTimeUsd + (b.reconstructed?.estimatedUsd ?? 0), exact: false };
}

/** Vendors in display order: the model vendor first, then research. */
export const BILLING_ORDER: BalanceVendor[] = ["openrouter", "you", "parallel"];

/** How a billing gap reads. */
export type GapTone = "ok" | "under" | "over" | "none";

/**
 * Classifies a billing gap (billed − recorded).
 * @param gapUsd - The gap, or null when there is nothing to compare yet
 * @returns `ok` within a few cents, `under` when the console recorded less than billed, `over` when more
 */
export function gapTone(gapUsd: number | null): GapTone {
  if (gapUsd === null) return "none";
  if (Math.abs(gapUsd) <= GAP_TOLERANCE_USD) return "ok";
  return gapUsd > 0 ? "under" : "over";
}

/**
 * Whether a fetch failed because the console API has no billing routes yet (older API build).
 * @param error - The fetch error
 * @returns True on 404
 */
export function isMissingRoute(error: Error | undefined): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * Sorts vendors into display order.
 * @param vendors - `billing.vendors`
 * @returns A new array
 */
export function orderVendors(vendors: OpsVendorBilling[]): OpsVendorBilling[] {
  return [...vendors].sort((a, b) => BILLING_ORDER.indexOf(a.vendor) - BILLING_ORDER.indexOf(b.vendor));
}

/** The billing check fetch plus the "read balances now" action. */
export type BillingState = OpsState<OpsBilling> & {
  /** Takes fresh readings (POST `billing/refresh`) and shows them. */
  readNow: () => void;
  /** True while readings are being taken. */
  reading: boolean;
  /** Bumps after each successful reading, for a success flash. */
  readCount: number;
  /** Why the last reading failed, if it did. */
  readError: Error | undefined;
};

/**
 * Fetches the billing check for the current time range and exposes "read balances now". A fresh reading replaces
 * the shown data at once; the next normal fetch takes over again.
 * @returns The billing state
 */
export function useBilling(): BillingState {
  const range = useTimeRange();
  const params = { from: range.from, to: range.to };
  const state = useOps<OpsBilling>("billing", params);
  const [fresh, setFresh] = useState<OpsBilling | undefined>(undefined);
  const [reading, setReading] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [readError, setReadError] = useState<Error | undefined>(undefined);

  // A newer GET result supersedes the reading we took.
  useEffect(() => setFresh(undefined), [state.data]);

  const readNow = useCallback(() => {
    setReading(true);
    setReadError(undefined);
    opsPost<OpsBilling>("billing/refresh", { from: range.from, to: range.to })
      .then((data) => {
        setFresh(data);
        setReadCount((n) => n + 1);
      })
      .catch((error: Error) => setReadError(error))
      .finally(() => setReading(false));
  }, [range.from, range.to]);

  return { ...state, data: fresh ?? state.data, readNow, reading, readCount, readError };
}
