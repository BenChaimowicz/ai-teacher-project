import type { OpsBilling } from "@senoy/db/usage";
import { PlugZap } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Async, Spinner } from "@/components/States";
import { ReadNowButton, VendorBillingCard } from "@/views/billing/BillingParts";
import { isMissingRoute, orderVendors, useBilling } from "@/lib/billing";
import { BILLING_HELP } from "@/lib/glossary";
import { formatDateTime, formatDuration } from "@/lib/format";

/**
 * Billing check: what each vendor says we spent next to what the console recorded for the same window, so missing
 * or mis-priced calls show up as a gap.
 */
export function Billing() {
  const billing = useBilling();
  return (
    <>
      <PageHeader
        title="Billing check"
        description="What each vendor says we spent, next to what the console recorded for the same window."
        actions={
          <>
            {billing.loading && billing.data && <Spinner />}
            <ReadNowButton billing={billing} />
          </>
        }
      />
      {isMissingRoute(billing.error) && !billing.data ? (
        <BillingUnavailable />
      ) : (
        <Async state={billing} rows={8}>
          {(data) => <BillingBody billing={data} />}
        </Async>
      )}
    </>
  );
}

/**
 * The view once billing is loaded.
 * @param props.billing - The billing check
 */
function BillingBody({ billing }: { billing: OpsBilling }) {
  return (
    <div className="space-y-4">
      <div className="stagger grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {orderVendors(billing.vendors).map((v) => (
          <VendorBillingCard key={v.vendor} billing={v} />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {BILLING_HELP.snapshots} Timed readings every {formatDuration(billing.snapshotEveryMs)}.
        {billing.recordingStartedAt ? ` First Usage Record: ${formatDateTime(billing.recordingStartedAt)}.` : " No Usage Records yet."}
      </p>
    </div>
  );
}

/** Shown when the console API is an older build without the billing routes. */
export function BillingUnavailable({ compact }: { compact?: boolean }) {
  return (
    <div className={compact ? "flex items-start gap-3 p-4 text-xs" : "glass glow-border flex items-start gap-3 rounded-2xl border p-5 text-sm"}>
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ice/10 text-ice">
        <PlugZap className="size-4" />
      </span>
      <div>
        <div className="font-medium">The billing check isn&apos;t available from this console API yet</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          The running API has no <span className="font-mono">/api/ops/billing</span> route. Restart <span className="font-mono">pnpm dash</span> once the
          billing backend is in, and balances will start appearing.
        </div>
      </div>
    </div>
  );
}
