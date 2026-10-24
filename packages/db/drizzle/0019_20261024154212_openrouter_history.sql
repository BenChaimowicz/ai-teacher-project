CREATE TABLE "openrouter_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"key_hash" text NOT NULL,
	"model" text NOT NULL,
	"model_permaslug" text,
	"endpoint_id" text NOT NULL,
	"provider_name" text,
	"requests" integer NOT NULL,
	"usage_usd" double precision NOT NULL,
	"byok_usage_usd" double precision,
	"byok_requests" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"reasoning_tokens" integer,
	"cached_tokens" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "openrouter_activity_day_key_endpoint" UNIQUE("day","key_hash","endpoint_id")
);
--> statement-breakpoint
CREATE TABLE "openrouter_keys" (
	"hash" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"is_platform_key" boolean DEFAULT false NOT NULL,
	"usage_usd" double precision NOT NULL,
	"limit_usd" double precision,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "openrouter_activity" ADD CONSTRAINT "openrouter_activity_key_hash_openrouter_keys_hash_fk" FOREIGN KEY ("key_hash") REFERENCES "public"."openrouter_keys"("hash") ON DELETE no action ON UPDATE no action;