/** A persisted application-policy decision, not a model-owned verdict. */
export type ValidityResult = {
  policyVersion: number;
  outcome: "pass" | "clarify" | "reject";
  reason: string;
  safeReframe: string | null;
  question: string | null;
  /**
   * With a clarification: 2-4 short answers the Learner can tap instead of typing (SEN-87). Missing on decisions saved
   * before options existed, and on every pass or reject.
   */
  answerOptions?: string[];
};

/** Fewest and most readings a subject check offers before the Course Guide adds "None of these" (SEN-124). */
export const MIN_SUBJECT_READINGS = 2;
export const MAX_SUBJECT_READINGS = 5;

/** One thing a typed subject may mean: a short label that becomes the subject if picked, and a one-line gloss. */
export type SubjectReading = {
  label: string;
  gloss: string;
};

/**
 * The subject check that runs right after Compose, before Validity (spec §4.2, SEN-124). `outcome` is null while the
 * Learner chooses. `single`: one reading, nothing was asked. `chosen`: the Learner picked one of `readings`. `own_words`:
 * the Learner chose "None of these" and typed `answer`. `check_failed`: the triage call failed and the subject stays as
 * typed. In `chosen` and `own_words` the Request's `subject` holds the result; `subjectAsTyped` keeps what was written.
 */
export type SubjectCheck = {
  outcome: "single" | "chosen" | "own_words" | "check_failed" | null;
  subjectAsTyped: string;
  /** Empty unless the check found several readings. */
  readings: SubjectReading[];
  /** The picked label or the typed answer; null until the Learner answers. */
  answer: string | null;
};

/** Which adapter pair researches every Reading of a Course (spec §5.3, SEN-124). */
export const RESEARCH_TIERS = ["deluxe", "regular"] as const;
export type ResearchTier = (typeof RESEARCH_TIERS)[number];

/**
 * The triage model's rating of a focused Learning Goal, taken when generation starts. Code decides the tier from it:
 * niche or scholarly is deluxe. `dense` never decides; it is kept for the Usage Console.
 */
export type ResearchTierRating = {
  niche: boolean;
  scholarly: boolean;
  dense: boolean;
  /** One plain sentence on why, for the Usage Console. */
  reason: string;
  modelId: string;
};

/** The single targeted clarification and the Learner's latest response. */
export type ValidityClarification = {
  question: string;
  answer: string;
};

/** The most rounds of focusing questions before the Course Guide must propose a focused Learning Goal (SEN-90). */
export const MAX_FOCUS_ROUNDS = 3;

/** Questions in one focusing round. */
export const MAX_FOCUS_QUESTIONS = 3;

/** Tap-to-choose answers per focusing question, before the Course Guide adds "Something else". */
export const MIN_FOCUS_OPTIONS = 2;
export const MAX_FOCUS_OPTIONS = 5;

/** One focusing question: which part of the subject, how deep, or what finish line the Learner means. */
export type FocusQuestion = {
  /** Stable within the Request, e.g. `r1q2`. */
  id: string;
  question: string;
  /** Distinct answers built from this subject's real facets, in the Learner's voice. */
  options: string[];
};

/** The Learner's answer to one focusing question: a tapped option, or their own words under "Something else". */
export type FocusAnswer = {
  questionId: string;
  answer: string;
  /** True when typed under "Something else" rather than tapped. */
  ownWords: boolean;
};

/** One round of focusing questions and, once sent, the Learner's answers. */
export type FocusRound = {
  questions: FocusQuestion[];
  answers: FocusAnswer[] | null;
  /** Set on a round asked because the Learner said a proposed focus was "not quite" right. */
  afterProposal?: string;
};

/** What a Course covers and leaves out, as the Learner confirmed it. Each entry is a short facet phrase. */
export type GoalScope = {
  inScope: string[];
  outOfScope: string[];
};

/** A focused Learning Goal the Course Guide proposes, for the Learner to confirm. */
export type FocusProposal = {
  learningGoal: string;
  scope: GoalScope;
};

/**
 * How a Learning Goal was focused (SEN-90), stored on the Request. `outcome` is null while questions or a proposal are
 * open. `precise`: the goal already named its facet, depth, and finish line, so nothing was asked. `focused`: the Learner
 * confirmed `proposal`, which became the Request's Learning Goal, and `scope` is its in/out list. `broad_overview`: the
 * Learner skipped focusing on purpose; the goal stays as typed and there is no scope.
 */
export type GoalFocus = {
  outcome: "precise" | "focused" | "broad_overview" | null;
  /** The Learning Goal as the Learner typed it, before any rewrite. */
  originalGoal: string;
  rounds: FocusRound[];
  /** Open while `awaiting_focus_confirmation`; kept after confirming as the record of what was confirmed. */
  proposal: FocusProposal | null;
  /**
   * The goal a deliberate broad overview uses: one sentence the Course Guide writes from the typed goal when it first asks,
   * since a bare topic is not a goal sentence. Missing on a precise goal; `originalGoal` stands in when missing.
   */
  broadGoal?: string;
  /** The confirmed scope every later stage reads; null unless `focused`. */
  scope: GoalScope | null;
};

/**
 * Every Course Request status, in lifecycle order. `awaiting_subject_check` runs the subject check automatically after
 * Compose, and `awaiting_subject_choice` waits for the Learner to pick a reading (SEN-124); both lead to `awaiting_validity`.
 * `validity_passed` through `goal_focused` belong to focusing the
 * Learning Goal (SEN-90): questions open in `awaiting_focus_answers`, a proposed focus in `awaiting_focus_confirmation`,
 * and `goal_focused` means the goal is settled and the diagnostic may start. `assessment_*` through `starting_level_confirmed` belong to the
 * Starting Level diagnostic, where `assessment_failed` means the item set failed its checks with both Generators and only
 * Retry diagnostic is offered (spec §4.3); `blueprint_*` to the Course Blueprint; `generating` starts after Approve and ends in
 * `published` (the Course is playable) or `generation_failed` (with a plain-language reason). The Learner's Cancel moves
 * `generating` to `generation_cancelled`; Resume moves it back.
 */
export const COURSE_REQUEST_STATUSES = [
  "draft",
  "awaiting_subject_check",
  "awaiting_subject_choice",
  "awaiting_validity",
  "awaiting_clarification",
  "rejected",
  "validity_passed",
  "awaiting_focus_answers",
  "awaiting_focus_confirmation",
  "goal_focused",
  "assessment_preparing",
  "assessment_ready",
  "assessment_failed",
  "awaiting_gap_confirmation",
  "starting_level_confirmed",
  "blueprint_preparing",
  "blueprint_review",
  "generating",
  "published",
  "generation_failed",
  "generation_cancelled",
] as const;

/** One Course Request status. */
export type CourseRequestStatus = (typeof COURSE_REQUEST_STATUSES)[number];

/** Learner-facing unpublished Request; ownership is never exposed or accepted. */
export type CourseRequestRecord = {
  id: string;
  subject: string;
  learningGoal: string;
  status: CourseRequestStatus;
  createdAt: string;
  validity: ValidityResult | null;
  clarification: ValidityClarification | null;
  /** Null until the subject check runs (and on Requests from before SEN-124). */
  subjectCheck: SubjectCheck | null;
  /** Null until focusing starts after Validity passes (and on Requests from before SEN-90). */
  focus: GoalFocus | null;
  revisedFromId: string | null;
  /**
   * Plain-language reason the last step failed, with its next step: a Starting Level check or Blueprint that could not
   * be prepared, an assessment-failed set, or failed generation. Cleared when the Learner tries again.
   */
  failureReason: string | null;
};
