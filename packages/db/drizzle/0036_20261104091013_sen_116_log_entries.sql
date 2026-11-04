CREATE TYPE "public"."log_component" AS ENUM('api', 'worker', 'web', 'console');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('info', 'warn', 'error', 'fatal');--> statement-breakpoint
CREATE TABLE "log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"component" "log_component" NOT NULL,
	"level" "log_level" NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"request_id" uuid,
	"generation_job_id" uuid,
	"course_request_id" uuid,
	"learner_id" uuid,
	"pipeline_event_id" uuid
);
--> statement-breakpoint
ALTER TABLE "api_requests" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "request_id" uuid;--> statement-breakpoint
CREATE INDEX "log_entries_logged" ON "log_entries" USING btree ("logged_at");--> statement-breakpoint
CREATE INDEX "log_entries_level" ON "log_entries" USING btree ("level","logged_at");--> statement-breakpoint
CREATE INDEX "log_entries_component" ON "log_entries" USING btree ("component","logged_at");--> statement-breakpoint
CREATE INDEX "log_entries_request" ON "log_entries" USING btree ("request_id","logged_at") WHERE "log_entries"."request_id" is not null;--> statement-breakpoint
CREATE INDEX "log_entries_job" ON "log_entries" USING btree ("generation_job_id","logged_at") WHERE "log_entries"."generation_job_id" is not null;--> statement-breakpoint
CREATE INDEX "log_entries_course_request" ON "log_entries" USING btree ("course_request_id","logged_at") WHERE "log_entries"."course_request_id" is not null;--> statement-breakpoint
CREATE INDEX "log_entries_learner" ON "log_entries" USING btree ("learner_id","logged_at") WHERE "log_entries"."learner_id" is not null;--> statement-breakpoint
CREATE INDEX "log_entries_pipeline_event" ON "log_entries" USING btree ("pipeline_event_id","logged_at") WHERE "log_entries"."pipeline_event_id" is not null;--> statement-breakpoint
CREATE INDEX "api_requests_request" ON "api_requests" USING btree ("request_id") WHERE "api_requests"."request_id" is not null;