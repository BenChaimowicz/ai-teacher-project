# Blueprint design is a second kind of generation job

Designing the Course Blueprint now runs in the worker, as a `generation_jobs` row with `kind = 'blueprint'` (spec §5.1 lists it as a job stage). **Design my Course Blueprint** moves the Request to `blueprint_preparing` and queues the job in one transaction, so the Request is `blueprint_preparing` exactly while its Blueprint job is `queued` or `running`. The run saves the checked draft, moves the Request to `blueprint_review`, and settles the job in one transaction that first proves it still holds the lease. This amends ADR 0012, which had one job type per Request.

Both kinds share the claim, lease, heartbeat, and SIGTERM hand-back from ADR 0012. A Request has at most one job of each kind (`unique (course_request_id, kind)`). Approve queues the `course` job beside the finished `blueprint` one, and Cancel, Resume, and the Waiting view only touch the `course` job.

A Blueprint job keeps no checkpoints. A reclaimed run designs again from the start, since a draft is cheap next to a Lesson. Every failure (checks still failing after the bounded revisions, or a provider error) fails the job and returns the Request to `starting_level_confirmed` with a plain-language `failureReason`. **Try again** queues the same row again. A Blueprint job is never cancelled or interrupted.

Before this change the API designed the Blueprint inside the request, so a restart left the Request in `blueprint_preparing` with no way on. The migration moves such Requests back to `starting_level_confirmed` with a reason.

The Starting Level diagnostic still runs inside its API request. Its `assessment_preparing` is unstuck without a job: the API process remembers which checks it is preparing, and loading one it is not preparing (the API restarted) returns it to `validity_passed` with **Try again**. That is exact for the one API process (docs/deploy.md). Making it a job is the move if the API ever runs as more than one process.

Rejected:
- **A separate `blueprint_jobs` table.** It would copy the claim and lease code for a row with the same shape.
- **One row per Request whose kind changes at Approve.** The finished Blueprint job's record would be overwritten, and `claims` would mix the two runs.
- **Recovering a stuck `blueprint_preparing` on read, like the diagnostic.** The worker already recovers crashed jobs through the lease, and design can take minutes, which is too long to block an API request.
