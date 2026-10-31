---
date: 2026-10-31
tickets: SEN-47, SEN-55
people: Ben
status: active
---

# The media bucket is reached through `@aws-sdk/client-s3`, with the S3 keys already provisioned

Supabase ships no client of its own for its S3-compatible protocol; its documentation samples the AWS SDK for JavaScript v3 with `forcePathStyle: true`. The storage client in `packages/media` wraps that SDK for the three calls we need now: put, head and get. `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY` stay the credentials, as spec §2 already names them.

**What we turned down:** hand-rolling AWS Signature v4 over native `fetch`, which would have matched the OpenRouter transport's zero-dependency style in about eighty lines. Correct signing is easy to get subtly wrong, and finding those bugs against a live bucket is slower than carrying a dependency. We also turned down `supabase-js`'s storage module: it speaks the Storage REST API with a `service_role` key, which would mean two different new secrets and leave the provisioned S3 keys unused.

**What it costs:** a sizeable dependency tree, confined to `packages/media`.
