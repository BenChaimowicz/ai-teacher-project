---
date: 2026-11-01
tickets:
people: Ben
status: active
---

# Live checks keep running on the local Docker database, and record their paid calls as Usage Records in the shared database

**Why:** The Usage Records table has to match what the vendors bill. Since 2026-10-29 every course we generated and tested came from the `pnpm check:*:live` scripts (reuse, Demonstrative media, quiz), and tracking was only installed in the API and the worker, so none of that spend was recorded. The table stopped on Oct 29 while OpenRouter kept billing. We turned down keeping live checks out of the table and reconciling against OpenRouter's activity import: the import only has daily totals, needs the management key, and does not cover Parallel or You.com. Live checks stay on the local Docker database (`DATABASE_URL`) so they never touch shared Learners or Courses; only their Usage Records go to the shared database, through `USAGE_DATABASE_URL`, which is required and may not be a localhost URL so the records cannot vanish with the container. Each run is one `live_check` event labelled with its script name, so this developer spend never reads as Learner-driven generation. What it costs: every live check now needs `USAGE_DATABASE_URL`, and its records carry no Course Request or Learner, since those exist only locally. Its research calls are stored at list price, not measured against the vendor balance, because the script exits before a balance read is final. The calls already missed between Oct 29 and today cannot be rebuilt one by one, because no generation ids were kept.
