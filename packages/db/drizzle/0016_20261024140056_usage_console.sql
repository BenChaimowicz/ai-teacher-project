CREATE TABLE "api_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"url" text NOT NULL,
	"status_code" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"learner_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"label" text,
	"course_request_id" uuid,
	"learner_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"detail" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"learner_id" uuid,
	"course_request_id" uuid,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_event_id" uuid,
	"vendor" text NOT NULL,
	"role" text NOT NULL,
	"model_id" text NOT NULL,
	"provider" text,
	"response_id" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"outcome" text NOT NULL,
	"invalid_cause" text,
	"http_status" integer,
	"error" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"reasoning_tokens" integer,
	"cached_tokens" integer,
	"cost_usd" double precision,
	"cost_basis" text NOT NULL,
	"request" jsonb NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "api_requests" ADD CONSTRAINT "api_requests_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_parent_id_pipeline_events_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pipeline_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_course_request_id_course_requests_id_fk" FOREIGN KEY ("course_request_id") REFERENCES "public"."course_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_course_request_id_course_requests_id_fk" FOREIGN KEY ("course_request_id") REFERENCES "public"."course_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_pipeline_event_id_pipeline_events_id_fk" FOREIGN KEY ("pipeline_event_id") REFERENCES "public"."pipeline_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_requests_created" ON "api_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_requests_route" ON "api_requests" USING btree ("route","created_at");--> statement-breakpoint
CREATE INDEX "pipeline_events_started" ON "pipeline_events" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "pipeline_events_request" ON "pipeline_events" USING btree ("course_request_id");--> statement-breakpoint
CREATE INDEX "pipeline_events_parent" ON "pipeline_events" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "product_events_created" ON "product_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_records_created" ON "usage_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_records_event" ON "usage_records" USING btree ("pipeline_event_id");--> statement-breakpoint
CREATE INDEX "usage_records_model" ON "usage_records" USING btree ("model_id","created_at");