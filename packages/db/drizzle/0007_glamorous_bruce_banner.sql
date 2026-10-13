CREATE TABLE "unpublished_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_request_id" uuid NOT NULL,
	"slot_id" text NOT NULL,
	"position" integer NOT NULL,
	"teaching_method" text NOT NULL,
	"title" text NOT NULL,
	"lesson_goal" text NOT NULL,
	"objectives" jsonb NOT NULL,
	"topic_tags" jsonb NOT NULL,
	"lineage" jsonb,
	"sources" jsonb NOT NULL,
	"citations" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"source_packs" jsonb NOT NULL,
	"judge" jsonb NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unpublished_lessons_request_slot" UNIQUE("course_request_id","slot_id")
);
--> statement-breakpoint
ALTER TABLE "unpublished_lessons" ADD CONSTRAINT "unpublished_lessons_course_request_id_course_requests_id_fk" FOREIGN KEY ("course_request_id") REFERENCES "public"."course_requests"("id") ON DELETE no action ON UPDATE no action;