---
date: 2026-11-01
tickets: SEN-120, SEN-119
people: Yarden
status: active
---

# The Quiz author reasons at medium effort; the Quiz Judge stays at high

**Why:** ADR 0010 raised the Reading author and every Judge to high effort after measuring Readings. The Quiz author was set to high at the same time "as for the reading", with no measurement of its own. SEN-119 found that about $0.04 of each $0.07 Quiz is hidden reasoning, roughly 3,900 tokens a Quiz, and that 14 of 15 Quizzes passed their first draft at that setting. Turning the author down to medium is expected to save $0.06 to $0.10 on a 3-Quiz Course and some seconds per Quiz.

We turned down keeping high (no saving) and going to low or none (the Judge's reasons on the SEN-49 runs were about grounding, which is reasoning work, and we would rather not find out on real Learners).

**What it costs:** the first-draft pass rate may fall. Every failed draft costs a repair of about $0.07 plus a Judge read, so a pass rate below about 12 of 15 would wipe out the saving. The condition on this decision: the Quiz live check must still pass on its first draft before the SEN-120 re-run of the Norse and Gram test Courses, and if the re-run's Quizzes need more repairs than before, the author goes back to high. The Judge's effort is not touched (ADR 0010).
