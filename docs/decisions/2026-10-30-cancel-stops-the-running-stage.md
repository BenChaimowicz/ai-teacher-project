---
date: 2026-10-30
tickets: SEN-93
people: Yarden
status: active
---

# A Course run that loses its job (Cancel, or another worker took it over) stops its in-flight model and research calls, not just at the next stage

Cancel used to take effect only when the current stage ended, and a Reading stage takes 3–7 minutes. On 2026-10-25 a cancelled Course kept its worker busy for 3 more minutes and 4 more paid model calls. That busy worker is half of why a Retry queued meanwhile waited 3 minutes to be claimed. The lease heartbeat already notices within a third of the lease (20 s) that the run no longer holds its job. It now aborts the run's in-flight calls, so the worker is free and spending stops within about 20 s. Blueprint runs are left as they were: the Learner can't cancel one, so they lose their job only when a dead worker's lease lapses, and their one write already checks the lease.

**Why in SEN-93 and not a follow-up:** The ticket's acceptance asks only for fast claims while a worker is idle. We considered filing the abort as its own ticket, to keep this PR small. We chose to include it because a cancelled job is the most common way a worker is not idle, and every minute it keeps running is paid for. What we accept is a bigger PR that reaches into generation, the model transport and the research calls.
