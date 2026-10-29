ALTER TABLE "course_requests" ADD COLUMN "last_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "published_courses" ADD COLUMN "last_opened_at" timestamp with time zone;