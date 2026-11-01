---
date: 2026-11-01
tickets: SEN-110
people: Yarden
status: active
supersedes: 2026-10-31-the-seeded-learner-and-its-courses-are-dropped
---

# The seeded Learner and everything it owns are kept and handed to our first account, a test account of ours

Nothing is deleted. The shared database holds 17 Course Requests, 7 published Courses (35 Lessons), 11 Quiz attempts, and the Usage Console history of the prototype: 157 Pipeline Events, 452 Usage Records with real model costs, and about 8,500 API requests. All of it points at the seeded Learner. One step links that Learner to our first account, a test account of ours, and the account then signs in to the prototype's Courses and Progress. The published Courses also stay in Lesson reuse's pool (SEN-46).

**What we turned down:** deleting the seeded Learner and its Courses (the 2026-10-31 entry), which would throw away the cost history and the reuse pool. We also turned down keeping the usage rows but unlinking them from any Learner.

**What it costs:** a Learner can no longer simply share its id with the Supabase user. `learners` gets its own `auth_user_id`, so handing the seeded row over is one update instead of re-keying every table that points at it. This replaces the "same id by convention" detail in the 2026-10-31 e2e entry. The handover is a manual step that has to run once, before that account first uses the app.
