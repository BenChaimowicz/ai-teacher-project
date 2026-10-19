CREATE TYPE "public"."generation_job_status" AS ENUM('queued', 'running', 'cancelled', 'interrupted', 'failed', 'succeeded');--> statement-breakpoint
CREATE TYPE "public"."generation_stage" AS ENUM('lesson', 'publish');--> statement-breakpoint
ALTER TYPE "public"."course_request_status" ADD VALUE 'generation_cancelled';--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_request_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"status" "generation_job_status" DEFAULT 'queued' NOT NULL,
	"stage" "generation_stage",
	"current_slot_id" text,
	"claim_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"claims" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_jobs_course_request_id_unique" UNIQUE("course_request_id")
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_course_request_id_course_requests_id_fk" FOREIGN KEY ("course_request_id") REFERENCES "public"."course_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_jobs_claimable" ON "generation_jobs" USING btree ("status","created_at");--> statement-breakpoint
-- Requests generating in the API process before jobs existed resume as queued jobs.
INSERT INTO "generation_jobs" ("course_request_id", "learner_id") SELECT "id", "learner_id" FROM "course_requests" WHERE "status" = 'generating';
