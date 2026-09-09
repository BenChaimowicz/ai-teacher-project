ALTER TABLE "learners" ADD COLUMN "teaching_profile_version" integer;--> statement-breakpoint
ALTER TABLE "learners" ADD COLUMN "teaching_profile_answers" jsonb;--> statement-breakpoint
ALTER TABLE "learners" ADD COLUMN "teaching_profile_assessed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "learners" ADD COLUMN "teaching_profile_updated_at" timestamp with time zone;