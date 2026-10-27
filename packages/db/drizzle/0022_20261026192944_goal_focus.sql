ALTER TYPE "public"."course_request_status" ADD VALUE 'awaiting_focus_answers' BEFORE 'assessment_preparing';--> statement-breakpoint
ALTER TYPE "public"."course_request_status" ADD VALUE 'awaiting_focus_confirmation' BEFORE 'assessment_preparing';--> statement-breakpoint
ALTER TYPE "public"."course_request_status" ADD VALUE 'goal_focused' BEFORE 'assessment_preparing';--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "focus" jsonb;