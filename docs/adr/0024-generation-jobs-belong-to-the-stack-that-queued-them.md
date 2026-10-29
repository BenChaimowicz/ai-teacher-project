# Generation jobs belong to the stack that queued them

Every developer's stack runs against the one hosted Supabase database, and every worker used to claim any queued job. On 2026-10-25 a Retry of Ben's Norse Course (SEN-49) ran on Yarden's worker, which did not have PR #24. It failed the way that PR was meant to prevent, and we only noticed because the event detail had no `rounds` (SEN-92).

Each `generation_jobs` row now has an `owner`. The API writes its `jobOwner()` on the job when it queues it: on Prepare, Revise, and Approve, and again on Retry and Resume, so a job always moves to the stack that last asked for it. A worker claims only jobs whose `owner` is its own `jobOwner()`, including a running job whose lease lapsed. `jobOwner()` is `JOB_OWNER` when set. Otherwise it is the Railway environment id on Railway, which the API and worker services share. Otherwise it is the machine's hostname: a developer's API and worker run on one machine, so they agree without any setup, and two machines never match. Only a host other than Railway that splits the API and worker needs `JOB_OWNER`, set the same on both. A mismatch is silent, because the worker waits for jobs that never come, so the defaults are chosen to make one unlikely.

Jobs queued before this change have no owner. The first worker to claim one makes it its own, as every worker did before, so none is stranded. After that, only workers with its owner claim it, including after a lapsed lease.

Each run also records where it ran. The worker reads its host and its checkout's git commit, plus whether the checkout has uncommitted changes, when it claims a job. That goes into the `worker` detail of the run's `blueprint` or `course_generation` Pipeline Event. The commit is read per job, not at startup, because `tsx watch` does not restart the worker after a commit that leaves its files unchanged.

Rejected:
- **A database per developer.** It would end the sharing, but every developer would have to run migrations and seeds against their own Postgres, and the shared Usage Console history would split. That is worth doing if more people join; for two developers, owner tagging is enough.
- **Unset `JOB_OWNER` means a shared queue.** A developer who forgot to set it would share the queue again and hit the same bug without noticing. The hostname default makes the safe behaviour the one that needs no setup.
- **Leaving ownerless jobs unclaimed.** A job queued just before the migration would wait forever with no error.
