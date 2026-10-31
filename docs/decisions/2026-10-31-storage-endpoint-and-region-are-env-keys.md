---
date: 2026-10-31
tickets: SEN-47
people: Ben
status: active
---

# The media bucket's S3 endpoint and region are two explicit env keys, `MEDIA_ENDPOINT` and `MEDIA_REGION`

`ACCESS_KEY_ID` and `SECRET_ACCESS_KEY` were provisioned as Supabase S3-protocol keys, but an S3 client also needs the endpoint URL and the signing region, and neither was in `.env`. We add them as two keys in `.env.example`, the deploy env and the spec §2 key table, next to the keys they belong with.

**What we turned down:** deriving both from `DATABASE_URL`. The pooler user is `postgres.<project-ref>` and the host names the region, so the endpoint `https://<project-ref>.storage.supabase.co/storage/v1/s3` could be built without new keys. That couples storage to the shape of a connection string Supabase is free to change, and a direct (non-pooler) `DATABASE_URL` has a different shape.

**What it costs:** two more keys to set on every stack: local `.env`, and both Railway services.
