# A diagnostic preparation leases its Course Request

> **Amended 2026-11-04** ([decision](../decisions/2026-11-04-the-starting-level-check-is-built-after-the-prepare-request-answers.md), SEN-131): preparation no longer runs inside the prepare request. **Start the check** takes the lease and answers at once with `assessment_preparing`; the build, its heartbeat, and the guarded save run on in the API process after the reply, and the browser polls GET until the Request moves. The lease, the token-guarded writes, and the hand-back of a lapsed lease are unchanged, and a preparation that finishes after losing its lease now logs instead of answering 409. This is still not a generation job (ADR 0012): there is no queue and no worker, only a reply that no longer waits.

Preparing a Starting Level check still runs inside its API request, but the API no longer remembers which checks it is preparing. **Start the check** moves the Request to `assessment_preparing` and writes a `preparing_token` and a `preparing_until` lease in the same conditional update; the preparing API pushes the lease out every third of its length while it works. A read finds the check interrupted only once that lease has lapsed, so any API may serve the Learner. This amends ADR 0014, where `assessment_preparing` was unstuck from one process's memory and that was exact for one API process.

Every write the preparation makes checks its token, as a generation job checks its claim (ADR 0012). The ready attempt and the move to `assessment_ready` are one transaction guarded by the token: a preparation whose lease was handed back saves no attempt, and says so with a 409 rather than writing over the hand-back. Failures release the lease the same way.

Two people running the prototype against one hosted database used to cancel each other's checks: the second API saw `assessment_preparing` it was not preparing, reset the Request to **Try again**, and the first API's finished attempt was then dropped against a status that had moved (SEN-89, seen on 2026-10-24). A crashed API still recovers, because its lease stops being pushed out.

The lease is written and read by API processes, so it compares their clocks rather than the database's. A wrong hand-off needs more skew between two API hosts than an unpushed lease leaves (40 s of the 60 s default, `DIAGNOSTIC_LEASE_MS`), and the routes stay testable against the in-memory store the other route tests use.

Rejected:
- **Making the diagnostic a generation job**, which ADR 0014 named as the move once the API runs as more than one process. The Learner waits on this call and gets the item set back from it; a job would add a queue, a Waiting view, and polling for a step that takes minutes, not tens of minutes. The lease is the part of a job this needs.
- **Keeping the in-memory set and documenting one API process.** The prototype already runs two APIs whenever two people work on the same database, which is how the bug was found.
- **A lease on the diagnostic attempt row instead.** The attempt does not exist until preparation finishes, which is the whole window being protected.
