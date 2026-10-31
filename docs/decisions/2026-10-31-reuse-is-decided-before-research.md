---
date: 2026-10-31
tickets: SEN-46, SEN-113
people: Ben
status: active
---

# Whether a Reading slot reuses a Lesson is decided on its objectives before research, and only slots that will be generated are researched up front

Since SEN-82 every Reading is researched at once, before writing starts, while spec §5.8 runs reuse lookup inside writing, after the earlier Lessons are finalized. Left that way, a reused slot pays for research nobody reads: a reused Lesson is checked against the Sources it was written from, not new ones. Research is not cheap. Over the last 30 days of `usage_records`, research cost $6.10 against $5.30 for the writing models, about $0.15 per Reading and up to three times that when broadened queries run. Researching first would throw away about half of what reuse saves.

Only part of §5.8 decides whether research is needed. Reuse versus generate is judged on objectives alone, so it can run before research: a database lookup by subject, teaching method, and Topic tags, then one fit call for each slot that has candidates. Slots with no fit are researched up front, in parallel, as now. Verbatim versus adapt depends on the Course's running terminology, so it stays in sequential writing. Neither needs new research, because an adapt pass may not add claims that need new Sources.

**What we turned down:** researching every slot as now, which is the least code but pays twice for every reused slot. Skipping research for any slot that merely has candidates, which would push every poor match into research in the middle of writing.

**What it costs:** §5.8 splits into two steps. Every slot with candidates gets a fit call (about $0.03) even when nothing ends up reused. When an adapt pass cannot satisfy its slot, that one slot is researched during writing through the existing per-slot research, adding 2–3 minutes to that run.

**Left for later:** a reused Lesson leans on research done for an earlier Course, which may have gone stale since: Sources moved or changed, or the facts themselves moved on. Judging from the original Course Request how likely that is, and refusing or refreshing such a candidate, is not part of SEN-46.
