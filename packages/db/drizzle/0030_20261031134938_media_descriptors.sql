CREATE TYPE "public"."media_kind" AS ENUM('image', 'animation', 'audio');--> statement-breakpoint
CREATE TYPE "public"."media_license" AS ENUM('public_domain', 'cc0', 'cc_by', 'cc_by_sa', 'product_owned');--> statement-breakpoint
CREATE TYPE "public"."media_origin" AS ENUM('library', 'generated');--> statement-breakpoint
CREATE TABLE "media_descriptors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "media_kind" NOT NULL,
	"origin" "media_origin" NOT NULL,
	"license" "media_license" NOT NULL,
	"license_url" text,
	"caption" text NOT NULL,
	"alt" text NOT NULL,
	"source" jsonb,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"media_category" text NOT NULL,
	"topic_tags" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_descriptors_storage_key" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE INDEX "media_descriptors_category" ON "media_descriptors" USING btree ("media_category");