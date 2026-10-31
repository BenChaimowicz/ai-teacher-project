---
date: 2026-10-31
tickets: SEN-46
people: Ben
status: active
---

# An adapt pass may reorder a reused Lesson's explanations to this Learner's `explanationOrder` and trim it to a shorter `contentScope`, but never grow it; a candidate written for a shorter `contentScope` is not retrieved

These were the two questions the SEN-46 re-evaluation left open. A candidate whose `explanationOrder` differs (principle-first, example-first, or topic-appropriate) can be adapted: the pass moves each idea's example and principle into this Learner's order and keeps every claim and Citation, and the reading Judge checks the result as it would a written Lesson. A candidate longer than this Learner's `contentScope` can be trimmed, which §5.8 already allows as "trim material outside this remaining gap". A shorter one cannot be grown. Compact is 400–600 words and extended 1,200–1,800, so growing one into the other is a rewrite from the old excerpts, not the "lightly fill a missing sub-objective" pass §5.8 describes. So the length rule is applied at retrieval, in code, where it costs no model call. A candidate whose write-time fields were never recorded (published before SEN-46) is retrieved and left to the adapt pass.

**What we turned down:** dropping any candidate with a different `explanationOrder`. That splits an already small pool once more, for a change that adds no claim. On length, allowing growth by one step (compact to standard, standard to extended), or by any amount from the candidate's own excerpts. Either one turns adapt into generate-without-research, with only the Judge to tell the two apart.

**What it costs:** a Learner who asks for longer Lessons than most never gets a shorter Lesson reused, so reuse fires less for `extended`. Reordering touches every section, so an adapted Lesson can differ from its origin far more than a terminology pass would, and only the Judge checks that the reorder added nothing.
