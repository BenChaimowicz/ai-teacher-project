CREATE TABLE "course_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_request_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"draft" jsonb NOT NULL,
	"judge" jsonb NOT NULL,
	"sequence_mode" text DEFAULT 'linear' NOT NULL,
	"approved" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	CONSTRAINT "course_blueprints_course_request_id_unique" UNIQUE("course_request_id")
);
--> statement-breakpoint
ALTER TABLE "course_blueprints" ADD CONSTRAINT "course_blueprints_course_request_id_course_requests_id_fk" FOREIGN KEY ("course_request_id") REFERENCES "public"."course_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_blueprints" ADD CONSTRAINT "course_blueprints_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;