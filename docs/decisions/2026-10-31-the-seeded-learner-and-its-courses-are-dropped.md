---
date: 2026-10-31
tickets: SEN-110
people: Yarden
status: superseded
---

# The seeded Learner and everything it owns are deleted when accounts arrive, not handed to the first real account

Once auth ships, every Learner is a real account. The seeded row and its Course Requests, Courses, Progress and Quiz attempts are prototype data, and nobody needs them.

**What we turned down:** attaching the seeded Learner's data to the first account that signs up. That needs a one-off claim step that has to run exactly once, against a specific person.

**What it costs:** the Courses generated during the prototype are lost. Tests and e2e fixtures that use the seeded Learner id have to create their own accounts.
