import type { LearnerBlueprint } from "@senoy/db/blueprint";
import type { SequenceMode } from "@senoy/db/sequence-mode";
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

/** What the Waiting screen sees of a generation job. */
export type { GenerationView } from "@senoy/db/generation-job";

/** What Learner review sees of a Course Blueprint: titles and Lesson goals, and the Sequence mode pick. */
export type BlueprintView = {
  blueprint: LearnerBlueprint;
  sequenceMode: SequenceMode;
  approved: boolean;
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
    case "blueprint_preparing": return "Designing your Course Blueprint";
    case "blueprint_review": return "Review your Course Blueprint";
    case "generating": return "Generating your Course";
    case "published": return "Course published";
    case "generation_failed": return "Course generation failed";
    case "generation_cancelled": return "Course generation cancelled";
    default: return status.replaceAll("_", " ");
  }
}