ALTER TABLE "course_requests" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "published_courses" ADD COLUMN "hidden_at" timestamp with time zone;