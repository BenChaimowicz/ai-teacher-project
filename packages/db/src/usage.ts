/**
 * Usage Console vocabulary (CONTEXT.md: Usage Record, Pipeline Event, Product Event, API Request) and the response
 * shapes of the Operator-only `/api/ops/*` routes. The API builds these; the `/ops` screen reads them.
 */

/** The paid service a Usage Record called. */
export const USAGE_VENDORS = ["openrouter", "parallel", "you"] as const;
export type UsageVendor = (typeof USAGE_VENDORS)[number];

/** Which vendor bills each research adapter. */
export const RESEARCH_ADAPTER_VENDORS = { "parallel-pro": "parallel", "you-research": "you" } as const satisfies Record<string, UsageVendor>;

/** Vendors whose account balance the Usage Console reads. */
export const BALANCE_VENDORS = ["openrouter", "you", "parallel"] as const;
export type BalanceVendor = (typeof BALANCE_VENDORS)[number];

/**
 * How a Usage Record got here. `captured`: written live as the call happened. `backfill`: rebuilt afterwards from a
 * vendor's own record of a past call (e.g. a Parallel run looked up by its id). "Recording started" counts only
 * `captured` rows.
 */
export const USAGE_ORIGINS = ["captured", "backfill"] as const;
export type UsageOrigin = (typeof USAGE_ORIGINS)[number];

/** Who made the call: a model port, or a research slot. */
export const USAGE_ROLES = ["generator", "fallback_generator", "judge", "research_primary", "research_secondary"] as const;
export type UsageRole = (typeof USAGE_ROLES)[number];

/**
 * How one external call ended. Model calls use the `ModelErrorCode` set plus `ok`; research calls use `ok`,
 * `empty_vendor`, `empty_filtered`, `timeout`, or `error`.
 */
export const USAGE_OUTCOMES = [
  "ok",
  "configuration",
  "network",
  "timeout",
  "http",
  "refusal",
  "incomplete",
  "invalid_output",
  "empty_vendor",
  "empty_filtered",
  "error",
] as const;
export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];

/**
 * Where a cost came from. `actual`: the vendor reported it (OpenRouter `usage.cost`). `estimated`: a list price
 * (research vendors never report cost, SEN-72). `unknown`: the call was billed or may have been, but nothing reports
 * how much (an OpenRouter call cut off by our timeout, SEN-71).
 */
export const COST_BASES = ["actual", "estimated", "unknown"] as const;
export type CostBasis = (typeof COST_BASES)[number];

/** The platform's own steps that group Usage Records and give them their purpose. */
export const PIPELINE_EVENT_KINDS = [
  "validity",
  "goal_focus",
  "diagnostic",
  "fact_check",
  "blueprint",
  "course_generation",
  "reuse",
  "research",
  "reading",
  "quiz",
  "course_judge",
  "publish",
] as const;
export type PipelineEventKind = (typeof PIPELINE_EVENT_KINDS)[number];

/** A Pipeline Event is `running` until its step returns or throws. */
export const PIPELINE_EVENT_STATUSES = ["running", "ok", "failed"] as const;
export type PipelineEventStatus = (typeof PIPELINE_EVENT_STATUSES)[number];

/** Things a Learner did. */
export const PRODUCT_EVENT_KINDS = [
  "course_request_created",
  "course_request_clarified",
  "course_request_focused",
  "diagnostic_submitted",
  "starting_level_confirmed",
  "starting_level_self_reported_new",
  "blueprint_approved",
  "blueprint_rejected",
  "generation_cancelled",
  "generation_retried",
  "lesson_completed",
  "quiz_submitted",
  "course_completed",
  "teaching_profile_saved",
] as const;
export type ProductEventKind = (typeof PRODUCT_EVENT_KINDS)[number];

/** What a model Usage Record stores as its request: everything we sent, minus credentials. */
export type ModelUsageRequest = {
  systemPrompt: string;
  input: unknown;
  schemaName: string;
  providerOrder?: string[];
  reasoning?: unknown;
  timeoutMs: number;
};

/** What a research Usage Record stores as its request. */
export type ResearchUsageRequest = { topic: string; adapter: string; timeoutMs: number };

// ---------------------------------------------------------------------------------------------------------------------
// `/api/ops/*` response shapes. Every list is newest first. Times are ISO strings; money is USD.
// ---------------------------------------------------------------------------------------------------------------------

/** Query every list and summary route accepts. `from`/`to` are ISO instants; default is the last 7 days. */
export type OpsRangeQuery = { from?: string; to?: string };

/** Money split by where it came from. `unknownCount` is how many billed calls have no reported cost. */
export type CostSplit = { actualUsd: number; estimatedUsd: number; totalUsd: number; unknownCount: number };

/** `GET /api/ops/summary` — the Overview. */
export type OpsSummary = {
  range: { from: string; to: string; bucket: "hour" | "day" };
  totals: CostSplit & {
    calls: number;
    failedCalls: number;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    p50DurationMs: number | null;
    p95DurationMs: number | null;
    courseRequests: number;
    pipelineEvents: number;
    failedPipelineEvents: number;
    productEvents: number;
    apiRequests: number;
    apiErrors: number;
  };
  /** The same totals for the range just before this one, for deltas. */
  previous: { totalUsd: number; calls: number; failedCalls: number };
  /** Spend and calls per time bucket, per model id (or research adapter). */
  timeseries: { bucket: string; key: string; costUsd: number; calls: number; failedCalls: number }[];
  byModel: OpsBreakdownRow[];
  byPipelineKind: OpsBreakdownRow[];
  byRole: OpsBreakdownRow[];
  /** Spend per paid vendor (`openrouter`, `parallel`, `you`). */
  byVendor: OpsBreakdownRow[];
  /**
   * Spend per serving provider: the OpenRouter host that answered a model call (Alibaba, OpenAI, …), or the vendor
   * for research calls. A model call that got no reply has no host and counts under `openrouter`.
   */
  byProvider: OpsBreakdownRow[];
  byOutcome: { outcome: UsageOutcome; calls: number }[];
  /** Calls per duration bucket (upper bound in ms; last bucket is `null` = no upper bound). */
  latencyHistogram: { upToMs: number | null; calls: number }[];
  topCourseRequests: OpsCourseRequestRow[];
};

/** One slice of spend. `key` is a model id, Pipeline Event kind, role, vendor, or provider. */
export type OpsBreakdownRow = CostSplit & {
  key: string;
  calls: number;
  failedCalls: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  promptTokens: number;
  completionTokens: number;
};

/** `GET /api/ops/usage-records` query. `q` searches model id, response id, and error. */
export type OpsUsageRecordQuery = OpsRangeQuery & {
  vendor?: UsageVendor;
  /** Serving provider, matching a `byProvider` key. */
  provider?: string;
  role?: UsageRole;
  modelId?: string;
  outcome?: UsageOutcome | "failed";
  pipelineKind?: PipelineEventKind;
  pipelineEventId?: string;
  courseRequestId?: string;
  q?: string;
  sort?: "createdAt" | "costUsd" | "durationMs";
  limit?: number;
  offset?: number;
};

/** One Usage Record row, without payloads. */
export type OpsUsageRecordRow = {
  id: string;
  createdAt: string;
  durationMs: number | null;
  vendor: UsageVendor;
  role: UsageRole;
  modelId: string;
  provider: string | null;
  responseId: string | null;
  attempt: number;
  outcome: UsageOutcome;
  invalidCause: string | null;
  httpStatus: number | null;
  error: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  cachedTokens: number | null;
  costUsd: number | null;
  costBasis: CostBasis;
  /** Research calls: the vendor balance drop measured across the call; null with a note when not measurable. */
  measuredCostUsd: number | null;
  measurementNote: string | null;
  pipelineEventId: string | null;
  pipelineKind: PipelineEventKind | null;
  pipelineLabel: string | null;
  courseRequestId: string | null;
  courseRequestSubject: string | null;
};

/** A page of a list route. */
export type OpsPage<T> = { rows: T[]; total: number };

/** `GET /api/ops/usage-records/:id` — one record with its full prompt and response, and where it sits. */
export type OpsUsageRecordDetail = OpsUsageRecordRow & {
  request: unknown;
  response: unknown;
  /** The Pipeline Event and its ancestors, innermost first. */
  pipelinePath: OpsPipelineEventRow[];
  /** Other attempts in the same Pipeline Event, in order (the retry chain). */
  siblings: OpsUsageRecordRow[];
};

/** `GET /api/ops/pipeline-events` query. */
export type OpsPipelineEventQuery = OpsRangeQuery & {
  kind?: PipelineEventKind;
  status?: PipelineEventStatus;
  courseRequestId?: string;
  limit?: number;
  offset?: number;
};

/** One Pipeline Event, with the cost of every Usage Record under it (its own and its descendants'). */
export type OpsPipelineEventRow = CostSplit & {
  id: string;
  parentId: string | null;
  kind: PipelineEventKind;
  label: string | null;
  status: PipelineEventStatus;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  courseRequestId: string | null;
  courseRequestSubject: string | null;
  calls: number;
  failedCalls: number;
};

/** `GET /api/ops/pipeline-events/:id`. */
export type OpsPipelineEventDetail = OpsPipelineEventRow & {
  detail: unknown;
  children: OpsPipelineEventRow[];
  usageRecords: OpsUsageRecordRow[];
};

/** One Course Request with what it cost so far. */
export type OpsCourseRequestRow = CostSplit & {
  id: string;
  subject: string;
  learningGoal: string;
  status: string;
  createdAt: string;
  calls: number;
  failedCalls: number;
  /** First Pipeline Event start to last finish. */
  wallMs: number | null;
};

/** `GET /api/ops/course-requests/:id` — the timeline: every Pipeline Event (flat, with parents) and Usage Record. */
export type OpsCourseRequestDetail = OpsCourseRequestRow & {
  events: OpsPipelineEventRow[];
  usageRecords: OpsUsageRecordRow[];
  productEvents: OpsProductEventRow[];
};

/** `GET /api/ops/failures` — failed calls and steps grouped by reason. */
export type OpsFailureGroup = {
  source: "usage_record" | "pipeline_event" | "api_request";
  /** e.g. `invalid_output/schema`, `timeout`, `http 429`, or a Pipeline Event error's first line. */
  reason: string;
  /** Model id, Pipeline Event kind, or route. */
  key: string;
  count: number;
  lastAt: string;
  wastedUsd: number;
  sampleIds: string[];
};

/** One Product Event. */
export type OpsProductEventRow = {
  id: string;
  createdAt: string;
  kind: ProductEventKind;
  learnerId: string | null;
  courseRequestId: string | null;
  detail: unknown;
};

/** `GET /api/ops/product-events` query. */
export type OpsProductEventQuery = OpsRangeQuery & { kind?: ProductEventKind; limit?: number; offset?: number };

/** One API Request. */
export type OpsApiRequestRow = {
  id: string;
  createdAt: string;
  method: string;
  route: string;
  url: string;
  statusCode: number;
  durationMs: number;
  error: string | null;
};

/** `GET /api/ops/api-requests` query. */
export type OpsApiRequestQuery = OpsRangeQuery & { route?: string; errorsOnly?: boolean; limit?: number; offset?: number };

/** `GET /api/ops/api-routes` — traffic per route. */
export type OpsApiRouteRow = {
  method: string;
  route: string;
  count: number;
  errors: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

/** One OpenRouter host that can serve a configured model, as OpenRouter lists it now. */
export type OpsModelEndpoint = {
  provider: string;
  /** OpenRouter's endpoint tag, e.g. `alibaba/fp8`. */
  tag: string | null;
  promptUsdPerMTok: number | null;
  completionUsdPerMTok: number | null;
  /** Whether it accepts every parameter we send (`response_format` + `reasoning`); OpenRouter only routes us to these. */
  servesOurCalls: boolean;
  uptimeLast30m: number | null;
  /** Typical time to first token over the last 30 minutes, in ms, as OpenRouter reports it. */
  latencyLast30mMs: number | null;
  throughputLast30m: number | null;
};

/** One configured model role and every host that could serve it. */
export type OpsSetupModel = {
  role: "generator" | "generator_fallback" | "lesson_generator" | "lesson_generator_fallback" | "judge" | "judge_fallback";
  modelId: string;
  /** Hosts we ask OpenRouter to try first, in order. Empty = OpenRouter chooses. */
  preferredProviders: string[];
  /** Null when OpenRouter's list could not be fetched; see `endpointsError`. */
  endpoints: OpsModelEndpoint[] | null;
  endpointsError: string | null;
};

/** `GET /api/ops/setup` — what the app is configured to call, so the console can list providers before any data. */
export type OpsSetup = {
  vendors: UsageVendor[];
  models: OpsSetupModel[];
  research: { slot: "primary" | "secondary"; adapterId: string; vendor: UsageVendor; estimatedCostUsd: number }[];
  /** Why research config could not be read, if it could not. */
  researchError: string | null;
  fetchedAt: string;
};

/** One balance reading, as the console shows it. */
export type OpsBalanceSnapshot = {
  takenAt: string;
  balanceUsd: number | null;
  pendingUsd: number | null;
  creditsTotalUsd: number | null;
  accountUsageUsd: number | null;
  keyUsageUsd: number | null;
  error: string | null;
};

/**
 * One vendor's billing check: what it says we spent versus what the console recorded.
 * `billedSinceFirstUsd` is the balance drop (or usage rise) between the first good reading and the latest one, plus
 * any top-ups; `recordedSinceFirstUsd` is what Usage Records say for the same window. `gapUsd` = billed − recorded.
 */
export type OpsVendorBilling = {
  vendor: BalanceVendor;
  /** `not_configured`: no credentials to read it (Parallel needs `pnpm parallel:login`). */
  status: "ok" | "not_configured" | "error";
  error: string | null;
  latest: OpsBalanceSnapshot | null;
  firstGoodAt: string | null;
  billedSinceFirstUsd: number | null;
  recordedSinceFirstUsd: number;
  gapUsd: number | null;
  /** All Usage Records ever, for this vendor. */
  recordedAllTimeUsd: number;
  /**
   * What the account started with. `vendor`: reported by the vendor (OpenRouter: our key's spend limit, since the
   * account is shared with other projects; the account's credits bought when the key has no limit). `operator`: told
   * to us by an Operator (You.com, Parallel), kept in the console API's config. Null when neither is known.
   */
  startingUsd: number | null;
  startingSource: "vendor" | "operator" | null;
  /**
   * Spend the console never saw (before recording began, untracked processes). OpenRouter: our key's reported lifetime
   * usage − `recordedAllTimeUsd`; other keys on the shared account are other projects and are ignored. You.com/Parallel:
   * (`startingUsd` − balance now) − `recordedAllTimeUsd`. `untrackedKeyUsd` is no longer used (always null).
   */
  untrackedAccountUsd: number | null;
  untrackedKeyUsd: number | null;
  /**
   * Research vendors only: calls rebuilt from what the platform stored before recording began (Source packs in
   * `lesson_research`, Starting Level diagnostics that used this vendor for fact-checks), priced at list price. A lower
   * bound: live checks and anything not stored are missing, and fact-check call counts were never stored.
   */
  reconstructed: {
    calls: number;
    estimatedUsd: number;
    /** Diagnostics that ran fact-checks on this vendor; each made an unknown number of calls. */
    factCheckDiagnostics: number;
    from: string | null;
    to: string | null;
  } | null;
  /** OpenRouter key usage windows as OpenRouter reports them. */
  keyWindows: { dailyUsd: number; weeklyUsd: number; monthlyUsd: number; limitUsd: number | null; remainingUsd: number | null } | null;
  /** Readings in the range, oldest first, for a balance-over-time line. */
  series: OpsBalanceSnapshot[];
};

/** `GET /api/ops/billing` (query: range). `POST /api/ops/billing/refresh` takes readings now and returns the same. */
export type OpsBilling = {
  vendors: OpsVendorBilling[];
  /** The first Usage Record ever written; spend before it was never recorded. Null when none yet. */
  recordingStartedAt: string | null;
  /** How often the console API takes readings while it runs. */
  snapshotEveryMs: number;
};

/** One day × model × serving endpoint of OpenRouter's own usage report for our key. */
export type OpsOpenRouterActivityRow = {
  day: string;
  model: string;
  /** Serving host, e.g. `alibaba/fp8`. */
  providerName: string | null;
  requests: number;
  usageUsd: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
};

/** A slice of OpenRouter's report: one model or provider. */
export type OpsOpenRouterSlice = {
  key: string;
  requests: number;
  usageUsd: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
};

/**
 * `GET /api/ops/openrouter-history` — everything `pnpm openrouter:import` stored for the platform's own key, all rows
 * (not limited by the console's time range). Other keys on the shared account are other projects and are never imported.
 */
export type OpsOpenRouterHistory = {
  key: { name: string; label: string | null; usageUsd: number; limitUsd: number | null; createdAt: string | null; fetchedAt: string } | null;
  totals: {
    usageUsd: number;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    cachedTokens: number;
    firstDay: string | null;
    lastDay: string | null;
  };
  /** Per UTC day: what OpenRouter billed our key, and what the console recorded for OpenRouter that day. */
  byDay: { day: string; usageUsd: number; requests: number; recordedUsd: number; recordedCalls: number }[];
  byModel: OpsOpenRouterSlice[];
  byProvider: OpsOpenRouterSlice[];
  /** Every stored row, newest day first, then by cost. */
  rows: OpsOpenRouterActivityRow[];
};

/** What a logged decision still is: the default, replaced by a later one, or simply undone. */
export const DECISION_STATUSES = ["active", "superseded", "reversed"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** One entry in the team's decision log: a Markdown file in `docs/decisions/`. */
export type OpsDecision = {
  /** The file name without `.md`, e.g. `2026-10-28-objective-grounding`. */
  id: string;
  /** The decision itself — the file's `#` heading. */
  decision: string;
  /** Why we decided it: the Markdown body under the heading. */
  why: string;
  /** When we decided it, `YYYY-MM-DD`. */
  when: string;
  /** Linear ids the decision was made about; empty when it spans the project. */
  tickets: string[];
  /** Who decided. */
  people: string[];
  status: DecisionStatus;
  /** Ids of the entries this one replaces. */
  supersedes: string[];
  /** Repo-relative path, so the console can say which file to edit. */
  path: string;
};

/**
 * `GET /api/ops/decisions` — the decision log read off disk, newest first. A file the parser could not read is
 * reported in `problems` rather than dropped, so a malformed entry is visible instead of silently missing.
 */
export type OpsDecisionLog = {
  decisions: OpsDecision[];
  problems: { path: string; problem: string }[];
  /** Repo-relative folder the entries were read from. */
  folder: string;
  readAt: string;
};

/** One item on the founders' setup checklist, with who ticked it and when. */
export type OpsSetupChecklistItem = {
  /** Stable key, e.g. `domain.auto-renew`. */
  key: string;
  label: string;
  /** When it was ticked, ISO; null while open. */
  completedAt: string | null;
  /** Who ticked it; null while open, or when the console that ticked it had no git user name. */
  completedBy: string | null;
};

/** One section of the setup checklist. */
export type OpsSetupChecklistSection = {
  key: string;
  title: string;
  /** What the section is for, in a sentence or two. */
  intro: string;
  items: OpsSetupChecklistItem[];
  done: number;
  total: number;
};

/** `GET /api/ops/setup-checklist` — the founders' shared setup checklist with its progress. */
export type OpsSetupChecklist = {
  sections: OpsSetupChecklistSection[];
  done: number;
  total: number;
  /** Who this console ticks items as (the checkout's `git config user.name`); null means it can read but not tick. */
  operator: string | null;
};
