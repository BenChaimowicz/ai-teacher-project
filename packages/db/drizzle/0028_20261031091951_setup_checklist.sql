CREATE TABLE "setup_checklist_progress" (
	"item_key" text PRIMARY KEY NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
