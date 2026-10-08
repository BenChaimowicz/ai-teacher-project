CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"feedback_timing" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correct" integer,
	"total" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_lesson_id_published_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."published_lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_attempts_learner_lesson" ON "quiz_attempts" USING btree ("learner_id","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_one_draft" ON "quiz_attempts" USING btree ("learner_id","lesson_id") WHERE "quiz_attempts"."status" = 'draft';