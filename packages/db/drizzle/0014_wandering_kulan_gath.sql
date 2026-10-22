CREATE TYPE "public"."generation_job_kind" AS ENUM('blueprint', 'course');--> statement-breakpoint
ALTER TYPE "public"."course_request_status" ADD VALUE 'assessment_failed' BEFORE 'awaiting_gap_confirmation';--> statement-breakpoint
ALTER TABLE "generation_jobs" DROP CONSTRAINT "generation_jobs_course_request_id_unique";--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "kind" "generation_job_kind" DEFAULT 'course' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_request_kind" UNIQUE("course_request_id","kind");--> statement-breakpoint
-- Blueprint preparation used to run inside an API request, so a restart left the Request in blueprint_preparing with no job to finish it.
UPDATE "course_requests" SET "status" = 'starting_level_confirmed', "failure_reason" = 'Designing your Course Blueprint was interrupted. Try again to design it.' WHERE "status" = 'blueprint_preparing';
