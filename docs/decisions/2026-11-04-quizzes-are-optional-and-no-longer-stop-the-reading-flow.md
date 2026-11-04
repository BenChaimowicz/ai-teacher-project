---
date: 2026-11-04
tickets: SEN-133
people: Yarden
status: active
---

# Quizzes are optional: the Learner opens one from a "Take quiz" action in its own UI, and no Quiz stands between Readings

**Why:** A Quiz today is a Lesson placed between Chapters. Next on the last Reading lands the Learner in it, and in linear Sequence mode every Lesson after an unpassed Quiz is locked. That interrupts the natural flow of learning: the Learner wants to keep reading and is stopped for a test. We turned down keeping Quizzes in the flow with a "skip" button, because the interruption itself is the problem, not the lock alone. It costs us the only gate that made sure a Learner checked their understanding before moving on, and it reopens what Progress, Sequence mode (ADR 0004) and Lesson completion mean for a Quiz. Those are open questions on SEN-133, to settle before building. Quizzes are still generated per Chapter and still pass the Publish gates; only Study changes.
