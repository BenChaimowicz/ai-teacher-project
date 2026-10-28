ALTER TABLE "course_requests" ADD COLUMN "preparing_token" uuid;--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "preparing_until" timestamp with time zone;--> statement-breakpoint
-- A check being prepared when this deploys has no lease, so no read would ever hand it back. Hand those back now.
UPDATE "course_requests" SET "status" = 'goal_focused', "failure_reason" = 'Preparing your Starting Level check was interrupted. Try again.' WHERE "status" = 'assessment_preparing';
