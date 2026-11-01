ALTER TABLE "learners" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "learners" ADD COLUMN "display_name" text;--> statement-breakpoint
-- The prototype's seeded Learner keeps its data until `pnpm db:claim-learner` hands it to an account (ADR 0026).
UPDATE "learners" SET "display_name" = 'Curious_Owl' WHERE "display_name" IS NULL;--> statement-breakpoint
ALTER TABLE "learners" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "learners" ADD CONSTRAINT "learners_auth_user_id_unique" UNIQUE("auth_user_id");
