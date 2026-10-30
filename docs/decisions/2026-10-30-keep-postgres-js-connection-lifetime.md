---
date: 2026-10-30
tickets: SEN-103, SEN-98
people: Yarden
status: active
---

# The API and worker fill their connection pools at startup, and connections keep postgres.js's default 30–60 minute lifetime

The first requests after startup were paying for connection setup: TCP, TLS and auth to the Supabase pooler. Fresh connections are opened only on demand, and a Study load now sends five queries at once, so each of those queries opened its own connection. The API now opens all 10 of its connections before it accepts traffic, and the worker opens both of its connections. The first `GET /api/library` after startup went from 899 ms to 296 ms, against about 250 ms once warm.

**Why we kept `max_lifetime`:** We measured whether idle connections get dropped. With postgres.js's own recycling turned off, one connection sat idle for gaps of 1, 2, 5, 10 and 15 minutes. Every query after a gap ran at warm speed (about 60 ms), so the pooler doesn't drop idle clients, at least for gaps up to 15 minutes. Longer gaps weren't tested. The only thing that closes our connections is postgres.js itself: each one lives a random 30–60 minutes, and then the next query on that slot reconnects, which costs about 340 ms extra today. We considered setting `max_lifetime: null` so connections never recycle. We turned it down because a connection the pooler closed during a restart or failover would then surface as a failed request, not a quiet reconnect. What we accept is an occasional request that pays one connection setup. The random lifetimes mean they close one at a time, not all at once. We also didn't add a keepalive, since nothing drops idle connections.
