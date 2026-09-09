CREATE TABLE "lesson_completions" (
	"learner_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_completions_learner_id_lesson_id_pk" PRIMARY KEY("learner_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "published_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"published_course_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"teaching_method" text NOT NULL,
	"title" text NOT NULL,
	"lesson_goal" text NOT NULL,
	"objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topic_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assessed_lesson_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lineage" jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" jsonb,
	CONSTRAINT "published_lessons_course_position" UNIQUE("published_course_id","position")
);
--> statement-breakpoint
CREATE TABLE "published_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"published_course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "published_modules_course_position" UNIQUE("published_course_id","position")
);
--> statement-breakpoint
ALTER TABLE "published_courses" ADD COLUMN "subject" text NOT NULL;--> statement-breakpoint
ALTER TABLE "published_courses" ADD COLUMN "learning_goal" text NOT NULL;--> statement-breakpoint
ALTER TABLE "published_courses" ADD COLUMN "sequence_mode" text DEFAULT 'linear' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_lesson_id_published_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."published_lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_lessons" ADD CONSTRAINT "published_lessons_published_course_id_published_courses_id_fk" FOREIGN KEY ("published_course_id") REFERENCES "public"."published_courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_lessons" ADD CONSTRAINT "published_lessons_module_id_published_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."published_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_modules" ADD CONSTRAINT "published_modules_published_course_id_published_courses_id_fk" FOREIGN KEY ("published_course_id") REFERENCES "public"."published_courses"("id") ON DELETE no action ON UPDATE no action;