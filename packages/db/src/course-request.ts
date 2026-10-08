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

/** Learner-facing unpublished Request; ownership is never exposed or accepted. */
export type CourseRequestRecord = {
  id: string;
  subject: string;
  learningGoal: string;
  status: string;
  createdAt: string;
  validity: ValidityResult | null;
  clarification: ValidityClarification | null;
  revisedFromId: string | null;
};
