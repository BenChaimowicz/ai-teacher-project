ALTER TABLE "unpublished_lessons" ADD COLUMN "author_model_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "unpublished_lessons" ADD COLUMN "judge_model_id" text;