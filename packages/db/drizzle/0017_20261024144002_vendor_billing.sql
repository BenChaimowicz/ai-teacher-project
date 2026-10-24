CREATE TABLE "vendor_balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"balance_usd" double precision,
	"pending_usd" double precision,
	"credits_total_usd" double precision,
	"account_usage_usd" double precision,
	"key_usage_usd" double precision,
	"raw" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "measured_cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "measurement_note" text;--> statement-breakpoint
CREATE INDEX "vendor_balance_snapshots_vendor_taken" ON "vendor_balance_snapshots" USING btree ("vendor","taken_at");