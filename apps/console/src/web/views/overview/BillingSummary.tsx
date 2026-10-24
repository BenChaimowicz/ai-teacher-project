import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Async, Spinner } from "@/components/States";
import { Card } from "@/components/ui";
import { BillingUnavailable } from "@/views/Billing";
import { BillingStatusPill, GapValue, ReadNowButton, StartedWith, vendorColor } from "@/views/billing/BillingParts";
import { isMissingRoute, orderVendors, type BillingState } from "@/lib/billing";
import { vendorLabel } from "@/lib/labels";
import { formatAgo, formatUsd } from "@/lib/format";
import { useHref } from "@/lib/nav";

/**
 * The Overview's compact billing check: per vendor its status, balance, and whether the console's records match the
 * vendor's bill. The full cards live on the Billing view.
 * @param props.billing - The billing state
 */
export function BillingSummary({ billing }: { billing: BillingState }) {
  const href = useHref();
  return (
    <Card
      title="Billing check"
      subtitle="Vendor balances, and whether the console recorded everything they billed."
      actions={
        <>
          {billing.loading && billing.data && <Spinner />}
          {!isMissingRoute(billing.error) && <ReadNowButton billing={billing} />}
          <Link to={href("/billing")} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-ice transition-colors hover:bg-ice/10">
            Details <ArrowRight className="size-3" />
          </Link>
        </>
      }
    >
      {isMissingRoute(billing.error) && !billing.data ? (
        <BillingUnavailable compact />
      ) : (
        <Async state={billing} rows={3}>
          {(data) => (
            <div className="stagger grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
              {orderVendors(data.vendors).map((v) => (
                <Link key={v.vendor} to={href("/billing")} className="group flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-ice/[0.04]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-2.5 rounded-sm" style={{ backgroundColor: vendorColor(v.vendor) }} />
                      {vendorLabel(v.vendor)}
                    </span>
                    <BillingStatusPill billing={v} />
                  </div>
                  {v.status === "not_configured" ? (
                    <span className="text-[11px] text-muted-foreground">Needs a one-time login to read its balance.</span>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xl font-semibold tabular-nums">{v.latest?.balanceUsd == null ? "—" : formatUsd(v.latest.balanceUsd)}</span>
                        <span className="text-[11px] text-muted-foreground">balance{v.latest ? ` · ${formatAgo(v.latest.takenAt)}` : ""}</span>
                      </div>
                      <StartedWith billing={v} compact />
                      <GapValue billing={v} compact />
                    </>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Async>
      )}
    </Card>
  );
}
