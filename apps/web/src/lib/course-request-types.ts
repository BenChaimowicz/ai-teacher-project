/** Saved, unpublished Course Request returned by the API. */
export type CourseRequestRecord = {
  id: string;
  subject: string;
  learningGoal: string;
  status: string;
  createdAt: string;
};

/** Displays stored Request statuses without exposing underscore-separated identifiers. */
export function courseRequestStatusLabel(status: string): string {
  return status === "awaiting_validity" ? "Awaiting validity review" : status.replaceAll("_", " ");
}