---
date: 2026-10-29
tickets: SEN-85
people: Yarden
status: active
---

# A structural sequence failure returns to Blueprint review by itself, and empty Source packs are re-searched with a deterministic broadening ladder

SEN-85 finishes the failure paths spec §5.1 and §5.9 describe, on top of the Retry that SEN-57 shipped. Two of its paths had a real choice in them.

**Why (structural return is automatic):** When the whole-Course Judge fails `sequence_reaches_goal`, the Lessons are individually fine and the plan is wrong, so no Retry of any Lesson can help. The run that discovers this already holds the job and is already writing a failure transaction, so it discards the unpublished Lessons, clears the approved snapshot, keeps the Request and its reason, and queues a Blueprint job that designs a new draft from the Judge's reason — all in that one transaction. The Learner comes back to a plan waiting for review instead of a dead end telling them to start over from Home.

We turned down a third tile next to Retry and Revise request ("design a new plan"), which the Learner would tap to trigger the same work. It gives them a say before we spend another Blueprint design, but it costs a Course Request status, a route, and a screen that can sit untouched forever while its stale unpublished Lessons stay on disk. What the automatic path costs us is one unasked-for Blueprint design per structural failure, and a Learner who wanted to abandon the subject entirely has to notice the new plan before Revise request.

**Why (deterministic broadening, not model-written queries):** Spec §5.9 asks for 2–3 rewritten or broader queries before a hard-to-research Lesson fails the Course. The ladder sends the full scoped topic, then the same topic without its objective list and out-of-scope clause, then bare title and subject — three attempts, no new model call inside the research stage, and a test that asserts the exact queries. A model rewriting the topic would probably write better queries for an odd subject, but it adds a provider call (and its own failure and timeout modes) to the one stage whose whole job is to survive vendors failing, and it makes the re-search untestable without yet another fixture. What we accept is a blunter second and third query than a model would write: broadening by deletion, not by rephrasing.

A pack that timed out or errored is not evidence of a hard-to-research topic, so it no longer counts as empty: the Lesson is an interruption that Retry resumes, not a terminal failure. Only `empty_vendor` and `empty_filtered` packs — the vendor answered, and there was nothing usable in the answer — exhaust the ladder and fail the Course.
