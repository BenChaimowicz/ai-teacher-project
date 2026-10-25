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

/** The single targeted clarification and the Learner's latest response. */
export type ValidityClarification = {
  question: string;
  answer: string;
};

/**
 * Every Course Request status, in lifecycle order. `assessment_*` through `starting_level_confirmed` belong to the
 * Starting Level diagnostic, where `assessment_failed` means the item set failed its checks with both Generators and only
 * Retry diagnostic is offered (spec §4.3); `blueprint_*` to the Course Blueprint; `generating` starts after Approve and ends in
 * `published` (the Course is playable) or `generation_failed` (with a plain-language reason). The Learner's Cancel moves
 * `generating` to `generation_cancelled`; Resume moves it back.
 */
export const COURSE_REQUEST_STATUSES = [
  "draft",
  "awaiting_validity",
  "awaiting_clarification",
  "rejected",
  "validity_passed",
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
  revisedFromId: string | null;
  /**
   * Plain-language reason the last step failed, with its next step: a Starting Level check or Blueprint that could not
   * be prepared, an assessment-failed set, or failed generation. Cleared when the Learner tries again.
   */
  failureReason: string | null;
};
