---
date: 2026-11-05
tickets: SEN-142, SEN-120
people: Ben
status: active
---

# Every Sol author call reasons at medium effort, not high, until a better setting is found

**Why:** On the Norse mythology Course of 2026-11-04 (request `2b5f4e9d`, $2.41, 14 Readings and 4 Quizzes), the largest single line was Sol's hidden reasoning. Sol's output costs $10 per million tokens, four times its input, and at high effort most of its output is reasoning the Learner never sees: 38k of the illustrator's 74k output tokens, 27k of the Chapter drafts' 34k. About $0.65 of the $1.77 OpenRouter spend was reasoning at high. The Quiz author went to medium on 2026-11-01 (SEN-119) and every Quiz since has passed its first draft, so the precedent holds. Ben decided that one rule covers every role Sol serves (Chapter and Reading drafts, repairs, the fallback rewrite, the illustrator, the Goal Check author, the Blueprint, the Starting Level items, goal focusing, validity, reuse fitting) rather than measuring each stage on its own: one constant, one place, and the saving lands now. Judges are untouched; they run on Luna at high effort (ADR 0010), where reasoning costs $0.50 per million.

We turned down keeping high on the Reading author, which ADR 0010 raised after Lessons overstated their excerpts with a 2,000-token cap and a no-reasoning Judge; that measurement was of low effort and a capped author, not of medium, and the Judge and Code checks still gate every Lesson. We also turned down low or none, for the reason the Quiz decision gave: grounding is reasoning work and we would rather not learn its cost on real Learners.

**What it costs:** first-draft pass rates may fall at every author stage at once, and each failed draft costs a repair plus a Judge read, so the saving must be measured, not assumed. SEN-142 re-runs the Norse and Gram test Courses and compares per-stage cost and pass rates against the 2026-11-04 run. If a stage's repairs eat its saving, that is reported on the ticket and the team decides; the setting is not reverted silently. This is a holding position: SEN-143 looks for a better illustrator model and effort, and a later measurement may pick a different effort per stage.
