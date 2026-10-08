ALTER TABLE "course_requests" ADD COLUMN "validity" jsonb;--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "clarification" jsonb;--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "revised_from_id" uuid;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_revised_from_id_course_requests_id_fk" FOREIGN KEY ("revised_from_id") REFERENCES "public"."course_requests"("id") ON DELETE no action ON UPDATE no action;