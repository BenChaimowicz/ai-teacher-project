CREATE TABLE "starting_level_diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_request_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviews" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coverage_note" text,
	"answers" jsonb,
	"starting_level" jsonb,
	"confirmation" text,
	"author_model_id" text,
	"judge_model_id" text,
	"fact_check_vendor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "starting_level_diagnostics" ADD CONSTRAINT "starting_level_diagnostics_course_request_id_course_requests_id_fk" FOREIGN KEY ("course_request_id") REFERENCES "public"."course_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starting_level_diagnostics" ADD CONSTRAINT "starting_level_diagnostics_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "starting_level_diagnostics_request" ON "starting_level_diagnostics" USING btree ("course_request_id");