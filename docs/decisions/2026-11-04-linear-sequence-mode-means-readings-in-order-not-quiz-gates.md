---
date: 2026-11-04
tickets: SEN-133
people: Yarden
status: active
---

# Linear Sequence mode stays, and now means "Readings in order": the Learner moves forward only from the bottom of the Reading they are on

**Why:** Linear used to lock every Lesson after an unpassed Quiz. Once Quizzes stop gating (SEN-133), that lock would never fire, so linear and free jump would behave the same. We turned down retiring Sequence mode, because a teacher who hands a Course to a student should still be able to make them go through it in order instead of jumping from Lesson 1 to Lesson 5. In linear, Lessons the Learner has not reached are disabled in the sidebar, and the only way forward is the action at the bottom of the current Reading. A Chapter Quiz opens once the Readings it covers have been read, and the Goal Check opens once every Reading has been read. Free jump opens everything. Quizzes stay optional in both modes. The cost: linear now gates Readings, which it never did before, so a Learner in linear cannot skip ahead to a later Reading even when they already know the material; free jump is the way out. ADR 0004 still holds (it covers where the mode is stored and the one-way switch, not what linear locks), so no new ADR is needed.
