ALTER TYPE "public"."generation_stage" ADD VALUE 'research' BEFORE 'lesson';--> statement-breakpoint
CREATE TABLE "lesson_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_request_id" uuid NOT NULL,
	"slot_id" text NOT NULL,
	"source_packs" jsonb NOT NULL,
	"researched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_research_request_slot" UNIQUE("course_request_id","slot_id")
);
--> statement-breakpoint
ALTER TABLE "lesson_research" ADD CONSTRAINT "lesson_research_course_request_id_course_requests_id_fk" FOREIGN KEY ("course_request_id") REFERENCES "public"."course_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Reading checkpoints saved before research moved up front keep their retrieval set as research rows.
INSERT INTO "lesson_research" ("course_request_id", "slot_id", "source_packs", "researched_at")
SELECT "course_request_id", "slot_id", "source_packs", "finalized_at" FROM "unpublished_lessons" WHERE "teaching_method" = 'reading';--> statement-breakpoint
ALTER TABLE "unpublished_lessons" DROP COLUMN "source_packs";