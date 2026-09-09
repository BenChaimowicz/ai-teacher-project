/** Questionnaire version stored on a saved Teaching Profile. */
export const TEACHING_PROFILE_VERSION = 1 as const;

/** Q2 declared-need flags. */
export const READING_SUPPORTS = [
  "plain_language",
  "short_headed_paragraphs",
  "inline_definitions",
] as const;

/** One Q2 reading-support flag. */
export type ReadingSupport = (typeof READING_SUPPORTS)[number];

/**
 * A stated preference, no preference, or skip.
 * @typeParam T - The value when the Learner selected one
 */
export type ProfileAnswer<T> =
  | { status: "selected"; value: T }
  | { status: "no_preference" }
  | { status: "skipped" };

/**
 * A declared need, an explicit none, or skip.
 * @typeParam T - The value when the Learner declared a need
 */
export type DeclaredNeed<T> =
  | { status: "declared"; value: T }
  | { status: "none_declared" }
  | { status: "skipped" };

/**
 * Q1: English, a language that is not listed, or skip. There is no no-preference option.
 */
export type InstructionLanguageAnswer =
  | { status: "declared"; value: "en" | "not_listed" }
  | { status: "skipped" };

/**
 * A resolved product setting plus why it has that value.
 * @typeParam T - The behavior the product will use
 */
export type ResolvedSetting<T> = {
  value: T;
  source: "declared_need" | "stated_preference" | "evidence_default";
};

/** Compact / standard / extended reading-Lesson scope. */
export type ContentScope = "compact" | "standard" | "extended";

/** Pause between sections vs continuous scroll. */
export type SectionAdvance = "manual" | "continuous";

/** Selected example-order values. Topic-appropriate is an Evidence default only. */
export type ExplanationOrderChoice = "example_first" | "principle_first";

/** Resolved example order, including the Generator-picks default. */
export type ExplanationOrder = ExplanationOrderChoice | "topic_appropriate";

/** How often Quiz Lessons appear. */
export type QuizCadence = "every_reading" | "every_2_to_3_readings" | "module_end";

/** When Quiz feedback appears. */
export type FeedbackTiming = "per_item" | "end_of_quiz";

/** How much Quiz feedback to write. */
export type FeedbackDepth = "brief" | "standard" | "detailed";

/** The eight stored Teaching Profile answers. Untouched items are saved as skipped. */
export type TeachingProfileAnswers = {
  instructionLanguage: InstructionLanguageAnswer;
  requiredReadingSupports: DeclaredNeed<ReadingSupport[]>;
  contentScope: ProfileAnswer<ContentScope>;
  sectionAdvance: ProfileAnswer<SectionAdvance>;
  explanationOrder: ProfileAnswer<ExplanationOrderChoice>;
  quizCadence: ProfileAnswer<QuizCadence>;
  feedbackTiming: ProfileAnswer<FeedbackTiming>;
  feedbackDepth: ProfileAnswer<FeedbackDepth>;
};

/** Derived settings. Not stored; computed from answers at read time. */
export type ResolvedTeachingProfile = {
  instructionLanguage: ResolvedSetting<"en">;
  requiredReadingSupports: ResolvedSetting<ReadingSupport[]>;
  contentScope: ResolvedSetting<ContentScope>;
  sectionAdvance: ResolvedSetting<SectionAdvance>;
  explanationOrder: ResolvedSetting<ExplanationOrder>;
  quizCadence: ResolvedSetting<QuizCadence>;
  feedbackTiming: ResolvedSetting<FeedbackTiming>;
  feedbackDepth: ResolvedSetting<FeedbackDepth>;
};

/** Write-time vs show-time is a property of the field, not of a Learner's answer. */
export const PROFILE_FIELD_CONSUMPTION = {
  instructionLanguage: "write_time",
  requiredReadingSupports: "write_time",
  contentScope: "write_time",
  explanationOrder: "write_time",
  quizCadence: "write_time",
  feedbackDepth: "write_time",
  sectionAdvance: "show_time",
  feedbackTiming: "show_time",
} as const;

const CONTENT_SCOPES: ContentScope[] = ["compact", "standard", "extended"];
const SECTION_ADVANCES: SectionAdvance[] = ["manual", "continuous"];
const EXPLANATION_ORDERS: ExplanationOrderChoice[] = ["example_first", "principle_first"];
const QUIZ_CADENCES: QuizCadence[] = [
  "every_reading",
  "every_2_to_3_readings",
  "module_end",
];
const FEEDBACK_TIMINGS: FeedbackTiming[] = ["per_item", "end_of_quiz"];
const FEEDBACK_DEPTHS: FeedbackDepth[] = ["brief", "standard", "detailed"];

/**
 * True when `value` is one of `allowed`.
 * @typeParam T - Member type of the allowed list
 */
function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/**
 * Reads a preference answer. Missing keys become skipped.
 * @typeParam T - Allowed selected values
 */
function parsePref<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): ProfileAnswer<T> {
  if (!raw || typeof raw !== "object") return { status: "skipped" };
  const row = raw as { status?: unknown; value?: unknown };
  if (row.status === "no_preference") return { status: "no_preference" };
  if (row.status === "skipped") return { status: "skipped" };
  if (row.status === "selected" && isOneOf(row.value, allowed)) {
    return { status: "selected", value: row.value };
  }
  return { status: "skipped" };
}

/**
 * Reads Q1. Missing or invalid becomes skipped.
 */
function parseLanguage(raw: unknown): InstructionLanguageAnswer {
  if (!raw || typeof raw !== "object") return { status: "skipped" };
  const row = raw as { status?: unknown; value?: unknown };
  if (row.status === "skipped") return { status: "skipped" };
  if (row.status === "declared" && (row.value === "en" || row.value === "not_listed")) {
    return { status: "declared", value: row.value };
  }
  return { status: "skipped" };
}

/**
 * Reads Q2. Missing or invalid becomes skipped.
 */
function parseSupports(raw: unknown): DeclaredNeed<ReadingSupport[]> {
  if (!raw || typeof raw !== "object") return { status: "skipped" };
  const row = raw as { status?: unknown; value?: unknown };
  if (row.status === "skipped") return { status: "skipped" };
  if (row.status === "none_declared") return { status: "none_declared" };
  if (row.status === "declared" && Array.isArray(row.value)) {
    const flags = row.value.filter((item): item is ReadingSupport =>
      isOneOf(item, READING_SUPPORTS),
    );
    const unique = [...new Set(flags)];
    if (unique.length === 0) return { status: "none_declared" };
    return { status: "declared", value: unique };
  }
  return { status: "skipped" };
}

/**
 * Turns unknown JSON into stored answers. Invalid or missing items are skipped, never inferred as a selection.
 * @param raw - Request body or database JSON
 */
export function parseTeachingProfileAnswers(raw: unknown): TeachingProfileAnswers {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    instructionLanguage: parseLanguage(body.instructionLanguage),
    requiredReadingSupports: parseSupports(body.requiredReadingSupports),
    contentScope: parsePref(body.contentScope, CONTENT_SCOPES),
    sectionAdvance: parsePref(body.sectionAdvance, SECTION_ADVANCES),
    explanationOrder: parsePref(body.explanationOrder, EXPLANATION_ORDERS),
    quizCadence: parsePref(body.quizCadence, QUIZ_CADENCES),
    feedbackTiming: parsePref(body.feedbackTiming, FEEDBACK_TIMINGS),
    feedbackDepth: parsePref(body.feedbackDepth, FEEDBACK_DEPTHS),
  };
}

/**
 * Resolves a preference to a product value without recording the default as a choice.
 * @typeParam T - Selected value type
 */
function resolvePref<T>(
  answer: ProfileAnswer<T>,
  fallback: T,
): ResolvedSetting<T> {
  if (answer.status === "selected") {
    return { value: answer.value, source: "stated_preference" };
  }
  return { value: fallback, source: "evidence_default" };
}

/**
 * Derives product settings from stored answers. Defaults are evidence defaults, not inferred picks.
 * @param answers - Saved questionnaire answers
 */
export function resolveTeachingProfile(answers: TeachingProfileAnswers): ResolvedTeachingProfile {
  const language: ResolvedSetting<"en"> =
    answers.instructionLanguage.status === "declared"
      ? { value: "en", source: "declared_need" }
      : { value: "en", source: "evidence_default" };

  let supports: ResolvedSetting<ReadingSupport[]>;
  if (answers.requiredReadingSupports.status === "declared") {
    supports = { value: answers.requiredReadingSupports.value, source: "declared_need" };
  } else if (answers.requiredReadingSupports.status === "none_declared") {
    supports = { value: [], source: "declared_need" };
  } else {
    supports = { value: [], source: "evidence_default" };
  }

  const explanation: ResolvedSetting<ExplanationOrder> =
    answers.explanationOrder.status === "selected"
      ? { value: answers.explanationOrder.value, source: "stated_preference" }
      : { value: "topic_appropriate", source: "evidence_default" };

  return {
    instructionLanguage: language,
    requiredReadingSupports: supports,
    contentScope: resolvePref(answers.contentScope, "standard"),
    sectionAdvance: resolvePref(answers.sectionAdvance, "continuous"),
    explanationOrder: explanation,
    quizCadence: resolvePref(answers.quizCadence, "every_2_to_3_readings"),
    feedbackTiming: resolvePref(answers.feedbackTiming, "per_item"),
    feedbackDepth: resolvePref(answers.feedbackDepth, "standard"),
  };
}
