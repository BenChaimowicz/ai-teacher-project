---
date: 2026-10-31
tickets: SEN-46
people: Ben
status: active
---

# A slot that will reuse a Lesson gets a copy of that Lesson's Source packs in its own `lesson_research` row, marked with the reused Lesson's id

A reused Lesson must pass its Code and Judge checks against the Sources it was written from, and those live in the origin Course's `lesson_research` row. When the fit call picks a candidate, before any research runs, its packs are copied into this Request's row for the slot, and `reused_lesson_id` names the published Lesson being reused. Every Lesson's retrieval set then stays with its own Course, as ADR 0009 says, so a Lesson reused a second time needs no walk back along its lineage. Resume needs no new state either: a slot with a row is not researched again, and the row says whether to reuse or write. When the reused Lesson cannot be made to fit, the row is deleted and the slot is researched afresh, the same path a slot with empty research takes.

**What we turned down:** storing only the reuse choice and loading the packs through lineage from the Course that researched them. That keeps one copy of the data, but a reuse of a reused Lesson has to walk the chain, and Resume needs a separate record of the choice.

**What it costs:** the packs are stored twice, usually tens of kilobytes of jsonb each. The two copies cannot drift: `lesson_research` is only ever deleted for a Request that has not published, and a published Request's rows never change.
