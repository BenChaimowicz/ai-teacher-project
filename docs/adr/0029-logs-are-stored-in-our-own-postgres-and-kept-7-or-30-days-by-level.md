# Logs are stored in our own Postgres, kept 7 days at `info` and 30 days at `warn` and above

Until SEN-116, finding out what happened meant reading the Pino output in each process's terminal. It was gone on restart, split across four processes and two developers' machines, and had nothing from the browser. Now an Operator finds what happened, and why, in the Usage Console. Ben settled the open questions at the checkpoint on 2026-11-04.

**Where.** Log Entries live in a `log_entries` table in the platform's own Supabase Postgres, next to the usage tracking tables. This extends ADR 0008 to logs: a Log Entry joins Course Requests, Generation jobs, Pipeline Events and Usage Records in plain SQL, and the Usage Console reads it with the runner it already has. The volume is small. Over the last two weeks the shared database saw 400 to 3,400 API Requests a day and about 100 Pipeline Events a day, and the whole database is 80 MB. Since request lines are not stored, we expect a few thousand Log Entries a day. Railway's own log view stays as the raw stdout fallback (7 days on Hobby, decision 2026-11-03). Unlike Usage Records, Log Entries are deleted when their retention ends.

**What is stored.** Lines at `info`, `warn`, `error` and `fatal`. `debug` and `trace` go to stdout only, and only when `LOG_LEVEL` asks for them. Fastify's own "incoming request" and "request completed" lines stay on stdout but are not stored, because `api_requests` already records every request (one source of truth). Each row holds:
- when it was logged,
- its component: `api`, `worker`, `web` (the Learner's browser) or `console` (the Usage Console's screens),
- its level and message,
- a context (jsonb) with everything else the line carried,
- five plain uuid columns, filled where they apply: request id, Generation job, Course Request, Learner, Pipeline Event.

The process sets the time for api and worker lines. Browser lines are timed when the server receives them, and the browser's own clock is kept in the context.

**The request id.** The API gives every request a uuid as its Fastify request id, and never takes one from the caller. The reply's `x-request-id` header carries it, and `api_requests.request_id` stores it. So does `generation_jobs.request_id`, on every job the request queues. Like `owner` (ADR 0024), it is set again on Retry and Resume, so it names the request that last queued the job. The tracking context (AsyncLocalStorage, ADR 0008) carries the request id along with the Learner and the current Pipeline Event. A worker's run carries its job's id, request id, Course Request and Learner, so every line of the run has them. A browser `api_failure` stores the failed reply's `x-request-id`. One lookup by request id then shows the browser's failure, the API's lines, and the run of the job the request queued. A model call reaches its lines through its Pipeline Event.

**Writing never breaks or slows the caller.**
- Each process has one sink. `push` only queues.
- A timer writes the queue every second, up to 200 rows per insert and one insert at a time. It uses a database connection kept for logs alone (`max: 1`), so a log write never takes a slot from a request's or a job's queries.
- The sink holds 5,000 rows at most. Beyond that, new rows are dropped and counted, and one `warn` row later says how many.
- A write that fails, or has not settled in 10 s, is dropped and reported to stderr, never back into the logger.
- Each row is made storable before it is queued. An id that is not a uuid moves into the context, so one bad row cannot fail its batch.
- Every line still reaches stdout.

The api and the worker flush the sink when they get SIGTERM, before they exit. On Railway both services set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`, so that flush has time to run.

**Redaction and size.** Pino's `redact` removes secrets from stdout, and the sink removes them again from every row: `authorization`, `cookie`, `set-cookie`, `password`, `token`, `refresh_token` and `access_token` (also `refreshToken` and `accessToken`) at any depth. The sign-in `code` is removed only inside request bodies, so error codes stay readable. Email addresses in a message or a context become `[email]`. Prompt and response text is never logged, since it lives in Usage Records. Learner ids (uuids) are kept. A message is capped at 2 KB and a context at 8 KB of JSON. A longer message is cut and ends with a marker. A larger context is replaced by a marked preview of its start.

**Browser errors.** The web app sends four kinds of event to `POST /api/client-logs`, in batches: uncaught errors, unhandled rejections, error-boundary catches, and API calls that answered 500 or more or got no answer. The route is open to signed-out browsers. It attaches the Learner when the access token is good, but never refreshes a session: a batch sent as the page closes would lose the new cookies, and the rotated refresh token with them. The server sets the component and the level. It caps each batch at 20 events and 64 KB, and allows 12 batches a minute per IP. Each API process stores at most 60 web events a minute and 500 a UTC day, and each event's stored context stays under 4 KB (a 2 KB stack and a 1.5 KB component stack). Past either cap, events are dropped, and one `warn` row an hour says how many. Ben set the daily cap on 2026-11-04 after review: without it, one sender could store about 1.1 GB a day for 30 days. With it, web rows add about 3 MB a day at worst, and normal use is a handful. The browser never reports a failure of its own sending, so it cannot loop. The Usage Console's screens send their errors to the console's own server (`POST /api/ops/client-logs`, component `console`), which takes writes from this machine only. The api route would need CORS and a sign-in rule the console doesn't have.

**Looking up.** The Usage Console's Logs view filters by component, minimum level, time range and each id. It searches the message, and links both ways between a Log Entry and its API Request, Generation job, Course Request, Pipeline Event and Learner. Every filter has an index: time, level with time, component with time, and one partial index for each id. Message search is a case-insensitive `ilike` within the time range. At our volume, a 7-day range is tens of thousands of rows. When that becomes slow, a pg_trgm GIN index speeds up the same query, and no code changes.

**Retention.** `info` rows are kept 7 days, and `warn`, `error` and `fatal` rows 30 days. The worker deletes older rows a minute after it starts and every hour after that. It deletes in batches of 5,000 with `for update skip locked`, so the workers of every developer sharing the database can prune without fighting.

**The ids are not foreign keys.** A log write must not fail for a missing parent: a Pipeline Event whose insert failed, or a request whose `api_requests` row is written after its own lines. And pruning a table this busy should never block deleting a Learner or a Course Request, nor wait for one (`pnpm db:claim-learner` deletes a Learner). So a Log Entry may name a row that no longer exists.

Rejected:
- **A hosted log service (Better Stack, Axiom).** Cheap at our volume, with fast search and its own retention. But the Console would need a cross-system query to join logs to Course Requests and jobs, it adds another vendor key, and browser logs would still need a relay through us to keep the key out of the page.
- **Railway's logs only.** 7 days on Hobby, no browser logs, and the Console can't query them.
- **Storing `debug`.** It is most of the volume, and it is rarely what we look for after the fact. When chasing something live, set `LOG_LEVEL=debug` for stdout.
- **Keeping `info` 14 days and `warn` and above 90 days**, as first proposed, or one flat 30 days. Ben chose 7 and 30: `info` is the bulk, and is rarely needed after a week.
- **Real foreign keys**, for the reasons above.
- **pg_trgm now.** It needs an extension and a hand-written line in the migration, for a table that is small for now.
- **A Pino transport in a worker thread**, Pino's usual way to ship logs. A worker thread would need its own database client and env, and its failures are harder to see. The in-process sink is small and writes through the same Drizzle setup.

What it costs: one more database connection per process, and at most one insert a second from each. Every stored line is parsed once more. A Log Entry can be lost when the buffer is full, when a write fails, or in the last second before a crash; stdout, and Railway's 7 days, still have it. Message search slows as the table grows, and a trigram index is the next step. The Usage Console's own server stores its lines too, as component `console`, next to its screens' errors.
