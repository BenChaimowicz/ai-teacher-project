/** Saved, unpublished Course Request returned by the API. */
export type { CourseRequestRecord } from "@senoy/db/course-request";

/** Displays stored Request statuses without exposing underscore-separated identifiers. */
export function courseRequestStatusLabel(status: string): string {
  switch (status) {
    case "draft": return "Editable draft";
    case "awaiting_validity": return "Awaiting validity review";
    case "awaiting_clarification": return "Awaiting your clarification";
    case "validity_passed": return "Validity review passed";
    case "rejected": return "Request rejected";
    default: return status.replaceAll("_", " ");
  }
}