---
date: 2026-10-30
tickets: SEN-93, SEN-70
people: Yarden
status: active
---

# The worker opens 10 database connections, not 2, and logs a claim or lease renewal still pending after 10 seconds

postgres.js sends a query to an idle connection first, then opens a new one. When every connection is busy, it pipelines the query onto one of them. SEN-70 found that Supabase's transaction pooler can lose a pipelined query, which then hangs forever. The worker had a pool of 2, yet its research stage runs every Reading at once: an event insert, two vendor calls with their Usage Records and measurements, and a transaction for each Reading, plus the lease heartbeat. So it pipelined routinely. Ten connections (the API's size), all opened at startup, cover a normal Course without pipelining. A stalled claim or renewal now shows up in the log instead of the worker going quiet.

**What we turned down:** postgres.js's `max_pipeline: 0` would stop pipelining outright, but its source shows it breaks transactions: `begin` only gets its connection when the pipeline has room. A shorter `statement_timeout` passed at connection time does nothing, because the pooler ignores it (tested: it stays at Supabase's 2 min role default). A server-side timeout also can't catch a query the pooler lost, since the server never sees it. The Console's fix, a limiter around every query, can't wrap Drizzle's queries and transactions without patching the driver.

**What it costs:** 8 more pooler client connections per running stack. A Course with more Readings than about 10 can still pipeline during research. The slow-query log is how we would notice.
