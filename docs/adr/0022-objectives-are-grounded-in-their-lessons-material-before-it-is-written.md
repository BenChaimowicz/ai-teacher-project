# Objectives are grounded in their Lesson's material before it is written

An approved Blueprint's objectives are written before anything is retrieved, so an objective can assert a fact the Lesson's own Sources do not support. When one does, the author has no passing draft: teaching the objective fails `claim_support`, and leaving it out fails `objective_coverage`. Nothing in the Course can resolve that, because every repair, the fallback author, and every Retry are handed the same objectives and the same Sources. ADR 0016 named this and left it open.

Course Request `a2951ebe` ("why do cats wag their tail", 2026-10-27) is what it costs. Slot 3's objectives said a puffed tail "when seen alone it could also indicate startle or **cold**", and that a slow side-to-side sweep in a resting cat "often indicat[es] **relaxation**". Its packs say a cold cat's fur puffs over the whole body, and one even carries the heading "Slow Does Not Automatically Mean Relaxed". The slot failed five worker claims over 20 hours, oscillating exactly as the vise predicts:

| Claim | Failed checks |
|---|---|
| 1 | `claim_support` — taught cold and relaxation |
| 2 | `claim_support`, `objective_coverage` |
| 3 | `objective_coverage` — dropped the cold claim to pass `claim_support` |
| 4, 5 | both again |

That is 67 vendor calls and $1.14 of the Request's $1.66, spent on a Lesson no model could write. The two Lessons before it had been written and checkpointed for nothing: the Course never published.

**Objective grounding** now runs for every Lesson, after its material is final and before a word is written, by a model that will not write it. A Reading's objectives are checked against its vetted Sources' excerpts, a Quiz's against the checkpointed Lessons it assesses. Each objective comes back `supported`, `rewritten` (its unsupported statements softened to what the material states, every other word kept), or `unsupported` (dropped). What survives is what the author is briefed on, what the Judge checks coverage against, and what the checkpoint records as the Lesson's objectives. The approved Blueprint is never rewritten: grounding keeps its wording beside each verdict, and the Pipeline Event records both.

Two checks lose their vise alongside it. The reading Judge is told that an objective the excerpts cannot support is not an `objective_coverage` failure, which is what the author prompt has always told the author to do; the Quiz Judge is told the same about an objective its Lessons do not teach. Grounding should mean neither ever fires, so they are backstops, not the mechanism.

A Reading whose Sources support no objective at all is `LessonUnresearchableError`, as if the packs were empty: the Course fails, that slot's research is discarded, and Retry searches again — a different draw, where rewriting the same draft was not. A Quiz whose Lessons teach none of its objectives fails on that one Code check before any item is written, so Retry costs one grounding call rather than six authored drafts.

Grounding makes the Course teach a little less than the Blueprint promised, which the whole-Course Judge now sees: it reads the checkpoints' objectives (§6.5), so if enough is dropped that the sequence no longer reaches the Learning Goal, it fails `sequence_reaches_goal` and the Request ends `needs_new_blueprint`. That is the honest outcome — the Course really would not reach the goal — and it is reached after one pass over an outline rather than after five Retries of an unwritable Lesson.

One grounding call per Lesson is about $0.002 at Judge rates. Against this Request, it is a rounding error either way: the two objectives would have been rewritten before slot 3's first draft.

Rejected:
- **Letting the Judge waive `objective_coverage` and nothing else.** The Lesson would quietly teach less than the Learner approved, with nothing recording what was dropped or why, and a later Quiz would still be told to assess it.
- **Failing the Course at Approve when an objective looks unsupportable.** Nothing has been retrieved then; the Blueprint Judge can only check objectives against its own knowledge, which is how "slow wag means relaxed" passed `factual_error` in the first place.
- **Rewriting the approved Blueprint instead of the Lesson's objectives.** The Learner approved that Blueprint, and a per-slot rewrite after Approve would change the Course under them with no review. The structural return to Blueprint review is SEN-85.
- **Capping Retries on a slot that keeps failing the same way.** It stops the bleeding without making the Lesson writable, and the Request still dies.
