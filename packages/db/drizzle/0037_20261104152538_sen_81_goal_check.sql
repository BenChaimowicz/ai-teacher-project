CREATE TABLE "goal_check_feedback" (
	"learner_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"reasons" jsonb NOT NULL,
	"other_text" text,
	"next_step" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_check_feedback_learner_id_lesson_id_pk" PRIMARY KEY("learner_id","lesson_id")
);
--> statement-breakpoint
ALTER TABLE "published_lessons" ADD COLUMN "objective_lesson_ids" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_check_feedback" ADD CONSTRAINT "goal_check_feedback_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_check_feedback" ADD CONSTRAINT "goal_check_feedback_lesson_id_published_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."published_lessons"("id") ON DELETE no action ON UPDATE no action;