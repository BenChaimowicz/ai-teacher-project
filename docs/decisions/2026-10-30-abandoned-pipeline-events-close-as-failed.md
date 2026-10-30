---
date: 2026-10-30
tickets: SEN-93
people: Yarden
status: active
---

# A run's Pipeline Events that are still open when its claim ends are closed as `failed` with a "lease lost" error, at the next claim

A Pipeline Event closes only when its step returns or throws. A worker that is killed, hangs, or shuts down cleanly in the middle of a job never gets there. Its events stay `running` forever, and the Usage Console shows them as live. On 2026-10-30, 13 events were stuck this way, the oldest from 10-24. Each event now records the claim token of the run it belongs to. Whenever any worker claims a job, it closes every `running` event whose claim token no running job holds any more, with status `failed` and a "lease lost" error. The migration closes the 13 old events, which have no claim token, the same way: anything still `running` a day after it started.

**Why `failed` and not a new status:** We considered a dedicated `abandoned` status. It would keep the Console's failure totals about steps that really failed. We turned it down because it means a new badge, label, colour and filter across the Console, for a case the error text already explains. What we accept is that a run lost to a dead worker counts as a failure in those totals.

**Why at the next claim:** The claim is the moment someone takes the job over, and it already runs as one statement per claim, so the cleanup costs one extra statement per claim, not one per poll. A run whose worker died with no other worker for its stack running stays open until a worker comes back. That is fine, because nothing has replaced it yet.
