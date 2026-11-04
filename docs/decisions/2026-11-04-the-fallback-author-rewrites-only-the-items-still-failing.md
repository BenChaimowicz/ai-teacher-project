---
date: 2026-11-04
tickets: SEN-131
people: Ben
status: active
---

# The fallback author rewrites only the items still failing, for as many rewrite rounds as the primary had

**Why:** When Sol's set still has failing items after its two rewrite rounds, Terra used to write all eight items again from scratch and the new set went through the Judge and the fact-check from the start. In the 294 s check measured on 2026-11-04, Sol spent 198 s on one or two stubborn items and Terra then spent 96 s on a fresh set; rewriting only the failing items would have made that about 220 s and $0.09 instead of $0.15. Terra now receives the set with its passing items kept and rewrites the failing ones through the same rewrite path Sol uses, with the same budget (`MAX_REWRITE_ROUNDS`, two rounds), so the whole check is one review loop with two authors in turn rather than two builds. The alternatives were to keep the fresh set (a second chance at the seven items that already passed, which nobody asked for) or to give Terra a single round (cheaper on the worst case, but it leaves the diagnostic failing on an item Terra might fix with one more look; the budget can be cut later if the measurements say so). What it costs us: "fallback" no longer means a second author's set, so the primary author's name stays on every attempt Terra finishes (ADR 0015 already records both), and the Judge sees a mixed Sol and Terra set, which ADR 0015 allows since Luna wrote none of it. Spec §4.3 and ADR 0015 are updated to say so.
