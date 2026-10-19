/** A persisted application-policy decision, not a model-owned verdict. */
export type ValidityResult = {
  policyVersion: number;
  outcome: "pass" | "clarify" | "reject";
  reason: string;
  safeReframe: string | null;
  question: string | null;
};

/** The single targeted clarification and the Learner's latest response. */
export type ValidityClarification = {
  question: string;
  answer: string;
};

/**
 * Every Course Request status, in lifecycle order. `assessment_*` through `starting_level_confirmed` belong to the
 * Starting Level diagnostic; `blueprint_*` to the Course Blueprint; `generating` starts after Approve and ends in
 * `published` (the Course is playable) or `generation_failed` (with a plain-language reason).
 */
export const COURSE_REQUEST_STATUSES = [
  "draft",
  "awaiting_validity",
  "awaiting_clarification",
  "rejected",
  "validity_passed",
  "assessment_preparing",
  "assessment_ready",
  "awaiting_gap_confirmation",
  "starting_level_confirmed",
  "blueprint_preparing",
  "blueprint_review",
  "generating",
  "published",
  "generation_failed",
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
  /** Plain-language reason, set only when generation failed. */
  failureReason: string | null;
};
