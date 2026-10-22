# Generation jobs are leased Postgres rows, claimed by the worker

Approve inserts one `generation_jobs` row in the transaction that moves the Request to `generating`; the worker claims it. A claim is an `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)` that sets `running`, a fresh `claim_token`, and a lease the worker renews every third of its length. A crashed worker stops renewing, and once its lease lapses the next claim takes the job over. A worker that gets SIGTERM hands its job back to `queued`.

The job never holds a cursor. Resume works from the checkpoints: generation skips any slot that already has an `unpublished_lessons` row and carries earlier Readings forward from those rows. Every write the job makes (a checkpoint, the publish transaction, the failure record) first locks the job row and checks that its `claim_token` is still current and the job is still `running`. Cancel clears the token, so a run in flight saves nothing more. A worker that lost its lease to a takeover is stopped the same way.

The Request status and the job status always move together in one transaction: the Request is `generating` exactly while the job is `queued` or `running`. Cancel moves the Request to `generation_cancelled`. An interruption (a provider error or timeout) leaves the job `interrupted` and the Request `generation_failed` with a reason that offers Retry. A failed check leaves the job `failed`. Retry queues a `failed` or `interrupted` job again; the new run has a fresh repair budget and skips finished checkpoints (SEN-57).

The generation code stays in the API package, and the worker imports it through package exports (`@senoy/api/generation-worker`, `@senoy/api/course-generation`). The API no longer runs generation itself.

Cancel takes effect at the next stage boundary or write, not mid-call. A model or research call already in flight finishes and is discarded. Aborting it would mean passing a signal through research and every Generator, and the spend saved is one Lesson at most.

Rejected:
- **A job-queue library (pg-boss, graphile-worker).** The spec rules out a second job system. One job type with one row per Request does not need retries, schedules, or fan-out.
- **LISTEN/NOTIFY instead of polling.** Supabase's pooler does not keep session-level listeners. A 2 s poll is cheap at one Learner.
- **A stored cursor (next slot index).** It would duplicate what the checkpoints already record and could disagree with them after a crash between the checkpoint write and the cursor update.
- **Moving generation into a shared package now.** It would mean moving a dozen files with no change in behaviour. Package exports give the worker the same code.
