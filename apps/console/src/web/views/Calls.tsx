import {
  PIPELINE_EVENT_KINDS,
  USAGE_OUTCOMES,
  USAGE_ROLES,
  USAGE_VENDORS,
  type OpsPage,
  type OpsSummary,
  type OpsUsageRecordRow,
} from "@senoy/db/usage";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CostLegend } from "@/components/Cost";
import { kindLabel, roleLabel } from "@/components/Badges";
import { Async, CAPTURE_HINT, EmptyState, Spinner } from "@/components/States";
import { Pager } from "@/components/Table";
import { UsageRecordTable, type UsageSort } from "@/components/UsageRecordTable";
import { ActiveFilters, Card, Select, TextInput } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatInt, humanize, shortId } from "@/lib/format";
import { useSetParams } from "@/lib/nav";
import { useTimeRange } from "@/lib/range";
import { useOps } from "@/lib/useOps";
import { Tip } from "@/components/Tip";
import { VENDOR_VS_PROVIDER } from "@/views/overview/ProviderSection";

/** Rows per page. */
const PAGE_SIZE = 50;

/** URL params that filter the Calls table, with their chip labels. */
const FILTERS = {
  vendor: "vendor",
  role: "role",
  modelId: "model",
  provider: "provider",
  outcome: "outcome",
  pipelineKind: "step",
  pipelineEventId: "step id",
  courseRequestId: "Course Request",
  q: "search",
} as const;

/**
 * Calls: every Usage Record in the range with filters, sort, search, and paging. Every filter lives in the URL, so
 * Overview clicks land here pre-filtered and any view is linkable. Rows open the Usage Record drawer.
 */
export function Calls() {
  const range = useTimeRange();
  const [search] = useSearchParams();
  const setParams = useSetParams();
  const get = (k: string) => search.get(k) ?? "";
  const page = Math.max(0, Number(search.get("page") ?? 0) || 0);
  const sort = (search.get("sort") as UsageSort | null) ?? "createdAt";

  const [q, setQ] = useState(get("q"));
  useEffect(() => setQ(get("q")), [search.get("q")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (q === get("q")) return;
    const timer = window.setTimeout(() => setParams({ q }), 300);
    return () => window.clearTimeout(timer);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = {
    from: range.from,
    to: range.to,
    vendor: get("vendor"),
    role: get("role"),
    modelId: get("modelId"),
    provider: get("provider"),
    outcome: get("outcome"),
    pipelineKind: get("pipelineKind"),
    pipelineEventId: get("pipelineEventId"),
    courseRequestId: get("courseRequestId"),
    q: get("q"),
    sort,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  const records = useOps<OpsPage<OpsUsageRecordRow>>("usage-records", query);
  const models = useOps<OpsSummary>("summary", { from: range.from, to: range.to });
  const modelIds = models.data?.byModel.map((m) => m.key).sort() ?? [];
  const providers = models.data?.byProvider?.map((m) => m.key).sort() ?? [];

  const chips = (Object.keys(FILTERS) as (keyof typeof FILTERS)[])
    .filter((k) => get(k))
    .map((k) => {
      const v = get(k);
      const shown =
        k === "pipelineKind" ? kindLabel(v) : k === "role" ? roleLabel(v) : k.endsWith("Id") && k !== "modelId" ? shortId(v) : humanize(v);
      return { key: k, label: `${FILTERS[k]}: ${shown}`, onRemove: () => setParams({ [k]: undefined }) };
    });

  return (
    <>
      <PageHeader
        title="Calls"
        description="Every Usage Record: one external call to a model or research vendor, with its cost, outcome, and payloads."
        actions={<CostLegend />}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <TextInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search model, response id, error…"
              className="w-64 pl-7"
            />
          </span>
          <Select label="Step" value={get("pipelineKind")} onChange={(e) => setParams({ pipelineKind: e.target.value })}>
            <option value="">All</option>
            {PIPELINE_EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </Select>
          <Select label="Outcome" value={get("outcome")} onChange={(e) => setParams({ outcome: e.target.value })}>
            <option value="">All</option>
            <option value="failed">Any failure</option>
            {USAGE_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {humanize(o)}
              </option>
            ))}
          </Select>
          <Select label="Role" value={get("role")} onChange={(e) => setParams({ role: e.target.value })}>
            <option value="">All</option>
            {USAGE_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
          <Select label="Vendor" value={get("vendor")} onChange={(e) => setParams({ vendor: e.target.value })}>
            <option value="">All</option>
            {USAGE_VENDORS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
          <Tip content={VENDOR_VS_PROVIDER}>
            <Select label="Provider" value={get("provider")} onChange={(e) => setParams({ provider: e.target.value })}>
              <option value="">All</option>
              {[...new Set([...providers, get("provider")].filter(Boolean))].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Tip>
          <Select label="Model" value={get("modelId")} onChange={(e) => setParams({ modelId: e.target.value })} className="max-w-[14rem]">
            <option value="">All</option>
            {[...new Set([...modelIds, get("modelId")].filter(Boolean))].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Select label="Sort" value={sort} onChange={(e) => setParams({ sort: e.target.value })}>
            <option value="createdAt">Newest</option>
            <option value="costUsd">Most expensive</option>
            <option value="durationMs">Slowest</option>
          </Select>
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {records.loading && <Spinner />}
            {records.data && `${formatInt(records.data.total)} calls`}
          </span>
        </div>
        {chips.length > 0 && (
          <div className="border-b px-3 py-2">
            <ActiveFilters
              chips={chips}
              onClear={() => setParams(Object.fromEntries(Object.keys(FILTERS).map((k) => [k, undefined])))}
            />
          </div>
        )}
        <Async state={records} rows={12}>
          {(data) =>
            data.rows.length === 0 ? (
              <EmptyState
                title={chips.length ? "No calls match these filters." : "No Usage Records in this range."}
                hint={chips.length ? "Clear a filter or widen the time range." : CAPTURE_HINT}
              />
            ) : (
              <>
                <UsageRecordTable rows={data.rows} sort={sort} onSort={(s) => setParams({ sort: s })} />
                <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(p) => setParams({ page: p || undefined }, { keepPage: true })} />
              </>
            )
          }
        </Async>
      </Card>
    </>
  );
}
