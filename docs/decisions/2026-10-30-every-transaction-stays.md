---
date: 2026-10-30
tickets: SEN-102, SEN-98
people: Yarden
status: active
---

# All 13 transactions stay; SEN-102 only makes job enqueueing one statement and drops the transaction when revising a rejected Request

SEN-102 expected some transactions to wrap a single statement or plain reads, and asked to remove those. The audit found none. Every one of the 13 either writes several rows that have to land together, or makes a worker write conditional on still holding the job's lease. Two examples: a status move together with its queued job, and a published Course together with its Lessons and the Request's new status. Removing any of them would let a crash or a lost lease leave half a change behind, and no test would catch it.

**Why the two small cuts:** `enqueueJob` was an UPDATE followed by an INSERT whenever nothing matched. With the existing unique key on (Request, kind), it becomes one `INSERT … ON CONFLICT DO UPDATE`, which saves a round trip inside four transactions with no change in behaviour. Revising a rejected Request writes only the new draft, so that path no longer needs BEGIN and COMMIT. Revising a failed Request still discards its Lessons and ends its job in the same transaction.

**Why not single-statement CTEs:** The user-facing multi-write transactions (Prepare, Revise and Approve a Blueprint, and the two Starting Level writes) could each become one SQL statement with data-modifying CTEs. That would save two to four round trips per click. We turned it down for two reasons. Each transaction relies on "abort when the guard row didn't match" and on taking locks in the same order as the worker, and both are hard to read and easy to get subtly wrong in one statement. And these are one-off clicks, not polled reads. What we accept is that those clicks keep paying for BEGIN, COMMIT and one statement per write. The worker's transactions stay as they are, because their round trips are small next to the model calls between them.
