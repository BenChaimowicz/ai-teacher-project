---
date: 2026-11-04
tickets: SEN-131, SEN-106
people: Ben
status: active
---

# The Starting Level check is built after the prepare request has answered, not inside it

**Why:** Railway closes any HTTP request that sends nothing for 5 minutes (SEN-106), and 2 of the last 6 checks took 294 s and 301 s to build, so a Learner on the slow tail would get an error instead of a check. The **Start the check** POST now takes the lease ADR 0023 already writes and answers at once with `assessment_preparing`; the build runs on in the API process and the Level screen, which already polled GET every 3 s for a check another API was preparing, waits the same way for its own. The alternatives were to make the build faster until it fits (SEN-131 steps 2 and 3 do that too, but a cap on model latency is not something we control) or to turn preparation into a generation job (rejected in ADR 0023: a queue and a worker for a step that takes minutes). What it costs us: a prepare failure is no longer the POST's reply but a `failureReason` the next GET reads, and a check whose API is redeployed mid-build is only handed back once its lease lapses (60 s), which was already the case for a crashed API.
