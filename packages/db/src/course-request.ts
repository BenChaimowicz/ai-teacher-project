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

/** Every Course Request status. Statuses after `validity_passed` belong to the Starting Level diagnostic. */
export type CourseRequestStatus =
  | "draft"
  | "awaiting_validity"
  | "awaiting_clarification"
  | "rejected"
  | "validity_passed"
  | "assessment_preparing"
  | "assessment_ready"
  | "awaiting_gap_confirmation"
  | "starting_level_confirmed";

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
};
