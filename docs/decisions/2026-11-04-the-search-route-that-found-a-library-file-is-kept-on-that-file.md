---
date: 2026-11-04
tickets: SEN-132
people: Yarden
status: active
---

# The search route that found a library file is kept on that file, and a category's next search starts from the routes of its files

**Why:** SEN-132 has the search remember what worked, so each Course makes the next search start in the right place. The route (which index, and the query or Commons category) is a fact about how one file got into the library. So it is a nullable `found_by` column on `media_descriptors`. The routes for a Media category are read from that category's files that a person has not removed.

We turned down two alternatives. Reading routes back out of past `media_search` Pipeline Events would need no migration, but tracking writes are best-effort and off in tests, so the memory could silently miss runs, and search would depend on the audit log's loose shape. A separate routes table, with hit counts, would be a second place that could drift from the library: a removed file's route could keep being used.

A seeded file has no route until a search first finds it and the Judge passes it; that search's route is then kept on it, as the first live run showed is needed (the seeded `Matchedgrip.jpg` was found and reused, and without it the next run had nothing to start from).

The cost: one migration on the shared database. Only the route that first found a file is kept; finding the same file again by another route does not add that route.
