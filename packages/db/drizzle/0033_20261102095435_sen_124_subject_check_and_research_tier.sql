ALTER TYPE "public"."course_request_status" ADD VALUE 'awaiting_subject_check' BEFORE 'awaiting_validity';--> statement-breakpoint
ALTER TYPE "public"."course_request_status" ADD VALUE 'awaiting_subject_choice' BEFORE 'awaiting_validity';--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "subject_check" jsonb;--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "research_tier" text;--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "research_tier_rating" jsonb;