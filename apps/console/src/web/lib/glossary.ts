import type { PipelineEventKind, ProductEventKind, UsageOutcome, UsageRole } from "@senoy/db/usage";

/**
 * Tooltip explanations, in plain words. Each may end with the technical term in a muted "Code:" note so a developer
 * can map it back to the code; the visible labels themselves live in `labels.ts`.
 */

/** What each outcome means. */
export const OUTCOME_HELP: Record<UsageOutcome, string> = {
  ok: "The call came back with a usable answer.",
  configuration: "Never sent: a key or model name is missing from the settings. Not retried. Code: configuration",
  network: "We couldn't reach the service at all (connection dropped, DNS, TLS). Code: network",
  timeout:
    "We stopped waiting because it took too long. The provider may still charge for it, so the cost is often unknown. Not retried. Code: timeout",
  http: "The service answered with an error, e.g. 429 (too many requests) or 5xx (their side broke). Not retried. Code: http",
  refusal: "The model declined to answer. Not retried. Code: refusal",
  incomplete: "The answer was cut off before it finished. Retried once, then the backup model. Code: incomplete",
  invalid_output: "The answer couldn't be used. Retried once on the same model, then once on the backup model. Code: invalid_output",
  empty_vendor: "Research: the service found nothing. Code: empty_vendor",
  empty_filtered: "Research: results came back, but our filters removed all of them. Code: empty_filtered",
  error: "Research: something unexpected broke. Code: error",
};

/** Why an answer was bad. */
export const INVALID_CAUSE_HELP: Record<string, string> = {
  unparseable: "Not readable: the answer was empty or not valid JSON. Code: unparseable",
  schema: "Wrong format: valid JSON, but not the shape we asked for. Code: schema",
  check: "Failed our checks: the right shape, but our own rules rejected it. Code: check",
};

/** What each role means. */
export const ROLE_HELP: Record<UsageRole, string> = {
  generator: "The main model that writes things: request checks, placement questions, course plans, lessons, quizzes. Code: generator",
  fallback_generator: "The backup model. Used after the main one gave a bad answer twice, or to write a replacement set. Code: fallback_generator",
  judge: "A model that checks another model's writing. It never reviews its own work. Code: judge",
  research_primary: "The main research service that finds sources for a lesson. Code: research_primary",
  research_secondary: "The backup research service. Code: research_secondary",
};

/** What each step does. */
export const KIND_HELP: Record<PipelineEventKind, string> = {
  validity: "Decides whether a course request is fine, needs clarifying, or must be rejected. Code: validity",
  diagnostic: "Writes the eight placement questions that find the learner's starting level. Code: diagnostic",
  fact_check: "Checks facts in the request or a draft. Code: fact_check",
  blueprint: "Designs the course plan: modules, lessons, goals, and quizzes. Code: blueprint",
  course_generation: "The whole writing run after the learner approves the plan. Research, lessons, quizzes, review, and publishing sit under it. Code: course_generation",
  research: "Finds web sources for one lesson. Code: research",
  reading: "Writes one reading lesson from its sources, then checks it. Code: reading",
  quiz: "Writes one quiz and checks it matches the lessons. Code: quiz",
  course_judge: "A last review of the whole course for consistency, by a model that wrote none of it. Code: course_judge",
  publish: "Final checks and publishing the finished course. Code: publish",
};

/** What each Learner action means. */
export const PRODUCT_EVENT_HELP: Partial<Record<ProductEventKind, string>> = {
  course_request_created: "A learner asked for a new course (subject and goal).",
  course_request_clarified: "The learner answered a clarifying question about their request.",
  diagnostic_submitted: "The learner answered the placement questions.",
  starting_level_confirmed: "The learner confirmed their starting level.",
  blueprint_approved: "The learner approved the course plan, so writing starts.",
  blueprint_rejected: "The learner rejected the course plan.",
  generation_cancelled: "The learner stopped the course being written.",
  generation_retried: "The learner pressed Retry after writing failed.",
  lesson_completed: "A lesson counted as done.",
  quiz_submitted: "The learner handed in a quiz.",
  course_completed: "Every lesson in the course is done.",
  teaching_profile_saved: "The learner saved their teaching preferences.",
};

/** Tooltips for measures and columns. */
export const METRIC_HELP = {
  usual: "Half of the calls finished faster than this. Code: p50 (median)",
  slowest: "1 in 20 calls took longer than this. A big gap from the usual time means call times are unpredictable. Code: p95",
  average: "Total time divided by the number of calls. A few very slow calls pull it up.",
  longest: "The single slowest one.",
  tokensIn:
    "Tokens in: text we sent the model (instructions + input). Tokens are the small word-pieces models read and bill by; roughly 1 token ≈ ¾ of a word.",
  tokensOut: "Tokens out: text the model wrote back. Usually costs more per token than tokens in.",
  reasoning: "Reasoning tokens: hidden thinking the model did before answering. Billed like tokens out but not part of the answer.",
  cached: "Cached tokens: part of tokens in that the provider had cached, so it cost less.",
  attempt: "Attempt number within the step (ADR 0015): a bad or cut-off answer gets one more attempt on the same model; attempt 3 uses the fallback model.",
  wasted: "Money spent on calls that didn't give a usable answer: bad answers, retries, and slow calls that were stopped.",
  failureRate: "Calls that didn't work, out of all calls.",
  wallTime: "From the first step starting to the last one finishing, including time the learner spent between steps.",
  exact: "Exact: the service told us what it charged.",
  estimated: "Estimated from the price list: research services don't tell us what they charge.",
  unknown: "Unknown: we were (or may have been) charged, but nothing told us how much, e.g. a call we stopped for taking too long.",
  vendorVsProvider:
    "Vendor is who we pay: OpenRouter for model calls, Parallel or You.com for research. Provider is who actually answered: OpenRouter routes each model call to a host (Alibaba, OpenAI, Google…). The same model can be cheaper or faster on one host; by our measurements DeepSeek on Alibaba is both.",
} as const;
