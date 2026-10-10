import type { Extremity, GapConfirmation, LearnerDiagnosticItem } from "@senoy/db/starting-level";

/** Saved, unpublished Course Request returned by the API. */
export type { CourseRequestRecord } from "@senoy/db/course-request";

/** What the browser sees of a Starting Level diagnostic: no keys and no per-item correctness. */
export type DiagnosticView = {
  id: string;
  items: LearnerDiagnosticItem[];
  result: {
    remainingGapStatement: string;
    coverageNote: string;
    extremity: Extremity;
    canExpandGap: boolean;
  } | null;
  confirmation: GapConfirmation | null;
};

/** Displays stored Request statuses without exposing underscore-separated identifiers. */
export function courseRequestStatusLabel(status: string): string {
  switch (status) {
    case "draft": return "Editable draft";
    case "awaiting_validity": return "Awaiting validity review";
    case "awaiting_clarification": return "Awaiting your clarification";
    case "validity_passed": return "Validity review passed";
    case "rejected": return "Request rejected";
    case "assessment_preparing": return "Preparing your Starting Level check";
    case "assessment_ready": return "Starting Level check";
    case "awaiting_gap_confirmation": return "Confirm where your Course starts";
    case "starting_level_confirmed": return "Starting point confirmed";
    default: return status.replaceAll("_", " ");
  }
}