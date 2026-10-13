import type { ApprovedBlueprint } from "@senoy/db/blueprint";
import type { Database } from "@senoy/db";

/** What generation receives after Approve. */
export type GenerationStart = {
  db: Database;
  courseRequestId: string;
  learnerId: string;
  approved: ApprovedBlueprint;
};

/**
 * Full-Course generation for an approved Blueprint. Runs in the API process on the happy path; it is not yet a
 * durable job (spec §5.1). SEN-43 onward generate the Lessons through this seam.
 */
export interface CourseGeneration {
  start(input: GenerationStart): Promise<void>;
}

/** The Request stays `generating` until later tickets fill in Lesson generation. */
export function createCourseGeneration(): CourseGeneration {
  return {
    async start() {},
  };
}
