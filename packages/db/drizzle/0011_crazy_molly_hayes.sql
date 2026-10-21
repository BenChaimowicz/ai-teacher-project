CREATE TABLE "course_completions" (
	"learner_id" uuid NOT NULL,
	"published_course_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_completions_learner_id_published_course_id_pk" PRIMARY KEY("learner_id","published_course_id")
);
--> statement-breakpoint
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_published_course_id_published_courses_id_fk" FOREIGN KEY ("published_course_id") REFERENCES "public"."published_courses"("id") ON DELETE no action ON UPDATE no action;