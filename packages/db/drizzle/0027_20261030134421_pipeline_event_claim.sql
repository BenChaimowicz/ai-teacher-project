ALTER TABLE "pipeline_events" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
CREATE INDEX "pipeline_events_running_claim" ON "pipeline_events" USING btree ("claim_token") WHERE "pipeline_events"."status" = 'running';--> statement-breakpoint
-- Steps a dead or stopped run left open before claims closed them (SEN-93) would spin as live forever. A step still
-- running a day after it started is one of those: close it at its last sign of life, as the claim-time cleanup does.
UPDATE "pipeline_events" AS "pe" SET
  "status" = 'failed',
  "error" = '[0027 migration] Lease lost: this step was still running a day after it started, so its run had stopped before it finished',
  "finished_at" = greatest(
    "pe"."started_at",
    (SELECT max(coalesce("child"."finished_at", "child"."started_at")) FROM "pipeline_events" AS "child" WHERE "child"."parent_id" = "pe"."id"),
    (SELECT max("used"."created_at") FROM "usage_records" AS "used" WHERE "used"."pipeline_event_id" = "pe"."id")
  )
WHERE "pe"."status" = 'running' AND "pe"."started_at" < now() - interval '1 day';
