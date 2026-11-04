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
  triage: "A cheap model for small questions: which subject the learner meant, and which research tier a course needs. No backup model. Code: triage",
  judge: "A model that checks another model's writing. It never reviews its own work. Code: judge",
  research_primary: "The main research service that finds sources for a lesson. Code: research_primary",
  research_secondary: "The backup research service. Code: research_secondary",
  media_search: "A free Wikimedia Commons call: a search for an image the library lacks, or the download of one file it found. Code: media_search",
};

/** What each step does. */
export const KIND_HELP: Record<PipelineEventKind, string> = {
  subject_check: "Lists the subjects a typed subject may mean, so the learner can pick one before the request is checked. Code: subject_check",
  validity: "Decides whether a course request is fine, needs clarifying, or must be rejected. Code: validity",
  goal_focus: "Decides whether the learning goal is specific enough, asks the learner focusing questions if not, and proposes a focused goal. Code: goal_focus",
  diagnostic: "Writes the eight placement questions that find the learner's starting level. Code: diagnostic",
  fact_check: "Checks facts in the request or a draft. Code: fact_check",
  blueprint: "Designs the course plan: modules, lessons, goals, and quizzes. Code: blueprint",
  research_tier: "Rates the focused goal (niche? scholarly? dense in facts?) and picks deluxe or regular research for every lesson. Code: research_tier",
  course_generation: "The whole writing run after the learner approves the plan. Research, lessons, quizzes, review, and publishing sit under it. Code: course_generation",
  reuse: "Decides whether one reading lesson can reuse a lesson already published in another course, before any research. A reused lesson is not researched. Code: reuse",
  research: "Finds web sources for one chapter: a run of one to four short reading lessons on one topic. Code: research",
  chapter: "One author call that drafts every reading lesson of a chapter at once from the chapter's sources, so short lessons cost what long ones did. Each lesson is then checked and repaired under its own reading step. Code: chapter",
  reading: "Checks one reading lesson (drafted with its chapter, or written here when it stands alone or reuses a published lesson), repairs it, and attaches its images and word list. Code: reading",
  quiz: "Writes one quiz and checks it matches the lessons. Code: quiz",
  goal_check: "Writes the Goal Check: the last check of a course, asked against the learner's learning goal, not one lesson. Code: goal_check",
  course_judge: "A last review of the whole course for consistency, by a model that wrote none of it. Code: course_judge",
  publish: "Final checks and publishing the finished course. Code: publish",
  media_search: "Looks on Wikimedia Commons for an image the library lacks: searches, keeps only files we may host, has the vision Judge check each against what it must show, and adds the first that passes to the library as not yet reviewed (see Media review). Code: media_search",
  illustration: "Draws one picture for a reading lesson: the illustrator model turns the lesson's description of the picture into a scene plan of paper cut-outs, our renderer draws it, and the vision Judge checks it against the facts it must show. A fail gets one more try with the Judge's reasons; after two fails the library and Commons are tried instead. Code: illustration",
  live_check: "A developer's live check (a pnpm check:*:live script) calling the real models and research vendors. Its label is the script; no Learner caused it. Code: live_check",
};

/** What each Learner action means. */
export const PRODUCT_EVENT_HELP: Partial<Record<ProductEventKind, string>> = {
  account_signed_up:
    "Someone asked for an account. No learner exists yet, so none is shown; the detail says whether the welcome email went out. No email address is stored.",
  account_verification_resent: "Someone asked for the welcome email again. No learner is shown, and no email address is stored.",
  account_signed_in:
    "A sign-in attempt, by password, email code or email link. A learner is shown only when it worked; the detail says how and what happened.",
  account_sign_in_code_requested: "Someone asked for a 6-digit sign-in code by email. No learner is shown, and no email address is stored.",
  account_password_reset_requested: "Someone asked for a password-reset email. No learner is shown, and no email address is stored.",
  account_password_set: "The learner set a new password (after a reset link, or from their account).",
  account_signed_out: "The learner signed out, on this device or everywhere.",
  account_renamed: "The learner changed their display name.",
  course_request_created: "A learner asked for a new course (subject and goal).",
  course_request_edited: "The learner edited the subject or goal of a request they hadn't sent on yet.",
  course_request_subject_chosen: "The learner picked which subject they meant, or typed their own under None of these.",
  course_request_clarified: "The learner answered a clarifying question about their request.",
  course_request_focus_answered: "The learner answered a round of questions that narrow their goal.",
  course_request_focus_not_quite: "The learner said Not quite to the focused goal, so they get more questions.",
  course_request_focused: "The learner's goal was settled: precise as typed, focused and confirmed, or skipped for a broad overview.",
  diagnostic_started: "The learner said they know some of it (or pressed Retry), so the placement questions are being prepared.",
  diagnostic_submitted: "The learner answered the placement questions.",
  starting_level_too_easy: "The learner pressed Start a bit earlier, so the course takes in more of the basics.",
  starting_level_confirmed: "The learner confirmed their starting level.",
  starting_level_self_reported_new: "The learner said they are brand new to the subject, so there are no placement questions.",
  blueprint_sequence_mode_chosen: "The learner picked lesson order (in order, or jump freely) while reviewing the course plan.",
  blueprint_approved: "The learner approved the course plan, so writing starts.",
  blueprint_rejected: "The learner marked lessons in the course plan as not relevant (with or without a reason) and asked for a new plan.",
  generation_cancelled: "The learner stopped the course being written.",
  generation_retried: "The learner pressed Retry after writing failed, or Resume after stopping it. The detail says which.",
  library_item_opened: "The learner opened a course or a request from Home or the sidebar.",
  library_item_hidden: "The learner removed a course or a request from Home. Nothing is deleted.",
  lesson_completed: "A lesson counted as done.",
  glossary_term_opened: "The learner opened a word's definition in a reading (hover, tap, or one of Jongi's word bubbles).",
  course_words_opened: "The learner opened the course's Words page: every word its readings defined, in one list.",
  course_sequence_mode_changed: "The learner switched a finished course from lessons in order to jump freely.",
  quiz_opened:
    "The learner opened a quiz from Take quiz. Quizzes are optional and never stop the reading. The detail says where they opened it (the sidebar or the card after a chapter's last reading) and whether they had taken it before.",
  quiz_closed: "The learner closed a quiz and went back to reading. The detail says whether they handed it in during that visit.",
  quiz_answer_checked: "The learner checked one quiz answer (when feedback comes after each question). The detail says if it was right.",
  quiz_submitted: "The learner handed in a quiz.",
  quiz_retaken: "The learner started a quiz again. Their best score is kept.",
  goal_check_answer_checked: "The learner checked one Goal Check answer (when feedback comes after each question). The detail says if it was right.",
  goal_check_submitted: "The learner handed in the Goal Check, the course's last check against their learning goal. The detail says met, partly met, or not met.",
  goal_check_retaken: "The learner started the Goal Check again. Their best score is kept.",
  goal_check_feedback_given: "After a not-met Goal Check, the learner said what the course was missing. The detail lists the reasons they picked.",
  goal_check_next_step_chosen: "After a not-met Goal Check, the learner chose what to do next: ask for a new course on what was missing, or nothing.",
  course_completed: "Every lesson in the course is done.",
  teaching_profile_saved: "The learner saved their teaching preferences.",
  teaching_profile_reset: "The learner cleared their teaching preferences.",
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
    "Vendor is who we pay: OpenRouter for model calls, Parallel or You.com for research. Provider is who actually answered: OpenRouter routes each model call to a host (OpenAI, Google, Alibaba…). The same model can be cheaper or faster on one host.",
} as const;

/** Tooltips for the research tier and its rating (SEN-124). */
export const RESEARCH_TIER_HELP = {
  tier: "Which pair of research services finds sources for every lesson of this course. Deluxe: Parallel Pro + You.com Research. Regular: Parallel core + You.com Research lite, about a quarter of the price. Picked when writing starts and kept for the whole course. Code: research_tier",
  mode: "The RESEARCH_TIER setting. Deluxe or Regular forces that tier for every course; Auto uses each course's rating. The rating is taken either way, so you can see what Auto would pick. Code: RESEARCH_TIER",
  rating:
    "The cheap triage model's three yes/no answers about the focused goal. Niche or scholarly earns Deluxe; dense in facts alone does not. A failed rating means Deluxe under Auto. Code: research_tier_rating",
  call: "The tier this research call ran on, read from which research service it used.",
} as const;

/** Tooltips for the billing check and measured research cost. */
export const BILLING_HELP = {
  measured:
    "Measured: the drop in the vendor's balance between a reading just before and just after this call. It is what the vendor really charged, as long as nothing else used the account at the same moment.",
  measuredMatch: "The measured balance drop matches the estimate to within a cent.",
  measuredDiffers:
    "The measured balance drop differs from the estimate. The price list may be out of date, or the vendor charged for extra work (more searches, a longer run).",
  measuredMissing: "No measured cost for this call.",
  billed:
    "What the vendor itself says we spent since the console's first good balance reading: the balance drop (or usage rise), plus any top-ups in between.",
  recorded: "What the console's Usage Records add up to for the same window: exact costs plus estimates.",
  gap: "Billed by the vendor minus recorded by the console. Near zero means the console saw every dollar.",
  gapUnder:
    "The vendor billed more than the console recorded. Likely causes: calls made before recording started, other keys or machines using the same account, calls we stopped for taking too long (billed but no price reported), or price changes the estimates don't know about.",
  gapOver:
    "The console recorded more than the vendor billed. Usually the price-list estimates are higher than what the vendor actually charged, or a reading was taken mid-call.",
  gapOk: "Within a few cents: the console's records match the vendor's bill.",
  keyWindows:
    "OpenRouter's own spend counters for our API key: today, this week, and this month (UTC). The bar shows how much of the key's spend limit is left.",
  startedWith:
    "What the account started with. OpenRouter reports every credit ever bought. You.com and Parallel don't, so their starting amounts were told to us by the team ($100 and $25) and are kept in the console API's config; update them after a top-up. Shown with ≈ only when it had to be worked out from today's balance plus known spend.",
  untrackedAccount:
    "Spent on the account that the console never saw: calls from before recording started, from other keys, or from processes running without tracking. Lifetime spend minus everything recorded. OpenRouter reports lifetime spend; for You.com and Parallel it is the starting amount minus the balance now. Code: untrackedAccountUsd",
  untrackedKey: "Spend on our own key that the console never saw, mostly calls from before recording started. Code: untrackedKeyUsd",
  reconstructed:
    "Rebuilt from what the platform stored before recording began: the Source packs saved for each lesson's research, priced at the list price per run. It is a lower bound: live checks and runs that left no stored trace are missing. Code: reconstructed",
  factChecks:
    "Placement diagnostics that ran fact-checks on this vendor before recording began. How many calls each one made was never stored, so they are counted but not priced.",
  noLifetime: "This vendor doesn't report lifetime spend, so only spend from the first balance reading on can be checked.",
  pending: "Parallel holds money for runs still in progress; it leaves the balance once they finish.",
  snapshots: "The console API reads each vendor's balance on a timer while it runs, and before and after every research call.",
} as const;
